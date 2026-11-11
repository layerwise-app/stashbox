// Server-only helpers for items. Every helper takes the owner's user ID and
// scopes its queries to it.
import { env } from 'cloudflare:workers';
import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '~/db';
import { items, shares, uploads } from '~/db/schema';
import { getStorageErrorCode } from '~/lib/storage';
import { cleanName, uniqueName, type Crumb, type Item } from '~/lib/files';

export const itemColumns = {
  id: items.id,
  parentId: items.parentId,
  type: items.type,
  name: items.name,
  size: items.size,
  mimeType: items.mimeType,
  starred: items.starred,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt
};

export type ItemRow = Omit<Item, 'location' | 'shared' | 'sharedVia'>;

export function idList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** IDs of `rootIds` and everything below them, as a subquery. */
export function subtreeQuery(userId: string, rootIds: string[]): SQL {
  return sql`WITH RECURSIVE tree(id) AS (
    SELECT id FROM items WHERE user_id = ${userId} AND id IN (${idList(rootIds)})
    UNION ALL
    SELECT i.id FROM items i JOIN tree t ON i.parent_id = t.id
    WHERE i.user_id = ${userId}
  ) SELECT id FROM tree`;
}

type AncestorRow = {
  id: string;
  name: string;
  parent_id: string | null;
  trashed_at: number | null;
};

/** The folder and its ancestors, outermost first. */
export async function ancestorsOf(
  userId: string,
  folderId: string
): Promise<AncestorRow[]> {
  const rows = await db.all<AncestorRow & { depth: number }>(sql`
    WITH RECURSIVE chain(id, name, parent_id, trashed_at, depth) AS (
      SELECT id, name, parent_id, trashed_at, 0 FROM items
      WHERE id = ${folderId} AND user_id = ${userId}
      UNION ALL
      SELECT i.id, i.name, i.parent_id, i.trashed_at, c.depth + 1
      FROM items i JOIN chain c ON i.id = c.parent_id
      WHERE i.user_id = ${userId} AND c.depth < 1000
    ) SELECT id, name, parent_id, trashed_at, depth FROM chain ORDER BY depth DESC`);
  return rows;
}

export async function crumbsFor(
  userId: string,
  folderId: string | null
): Promise<Crumb[]> {
  const root: Crumb = { id: null, name: 'All files' };
  if (!folderId) return [root];
  const chain = await ancestorsOf(userId, folderId);
  return [root, ...chain.map((row) => ({ id: row.id, name: row.name }))];
}

export async function getLiveItem(userId: string, id: string) {
  const [row] = await db
    .select({ ...itemColumns, storageKey: items.storageKey })
    .from(items)
    .where(
      and(eq(items.id, id), eq(items.userId, userId), isNull(items.trashedAt))
    );
  if (!row) throw new Error('That item no longer exists.');
  return row;
}

/** Checks that `folderId` is the user's live folder; null is the root. */
export async function assertFolder(userId: string, folderId: string | null) {
  if (folderId === null) return null;
  const folder = await getLiveItem(userId, folderId).catch(() => null);
  if (!folder || folder.type !== 'folder')
    throw new Error('That folder no longer exists.');
  return folder;
}

export async function childNames(
  userId: string,
  parentId: string | null,
  exceptId?: string
): Promise<string[]> {
  const rows = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        parentId === null ? isNull(items.parentId) : eq(items.parentId, parentId),
        isNull(items.trashedAt)
      )
    );
  return rows.filter((row) => row.id !== exceptId).map((row) => row.name);
}

export async function assertNameFree(
  userId: string,
  parentId: string | null,
  name: string,
  exceptId?: string
) {
  const names = await childNames(userId, parentId, exceptId);
  if (names.some((n) => n.toLowerCase() === name.toLowerCase()))
    throw new Error(`An item named “${name}” already exists here.`);
}

/** Bytes of every file the user owns, including Trash and uploads underway. */
export async function bytesUsed(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [stored] = await db
    .select({ total: sql<number>`coalesce(sum(${items.size}), 0)` })
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.type, 'file')));
  const [pending] = await db
    .select({ total: sql<number>`coalesce(sum(${uploads.size}), 0)` })
    .from(uploads)
    .where(
      and(eq(uploads.userId, userId), sql`${uploads.createdAt} > ${since.getTime()}`)
    );
  return Number(stored?.total ?? 0) + Number(pending?.total ?? 0);
}

/**
 * Moves items to new parents and names, refusing folder cycles and renaming
 * on clashes. Returns where each item was before, for Undo.
 */
export async function relocate(
  userId: string,
  entries: { id: string; parentId: string | null; name?: string }[]
) {
  const previous: { id: string; parentId: string | null; name: string }[] = [];
  const takenByParent = new Map<string | null, string[]>();
  const now = new Date();

  for (const entry of entries) {
    const item = await getLiveItem(userId, entry.id);
    const target = entry.parentId;
    await assertFolder(userId, target);
    if (target !== null && item.type === 'folder') {
      const chain = await ancestorsOf(userId, target);
      if (chain.some((row) => row.id === item.id))
        throw new Error(
          `You can’t move “${item.name}” into itself or one of its subfolders.`
        );
    }
    const wanted = entry.name ?? item.name;
    if (item.parentId === target && wanted === item.name) continue;

    if (!takenByParent.has(target))
      takenByParent.set(target, await childNames(userId, target));
    const taken = takenByParent.get(target)!;
    const name = uniqueName(
      wanted,
      taken.filter((n) => !(item.parentId === target && n === item.name)),
      item.type === 'folder'
    );
    taken.push(name);

    await db
      .update(items)
      .set({ parentId: target, name, updatedAt: now })
      .where(and(eq(items.id, item.id), eq(items.userId, userId)));
    previous.push({ id: item.id, parentId: item.parentId, name: item.name });
  }
  return previous;
}

/** Finds or creates the folder path `names` from the root. */
export async function ensurePath(userId: string, names: string[]) {
  let parentId: string | null = null;
  for (const raw of names) {
    const name = cleanName(raw);
    const [existing] = await db
      .select({ id: items.id })
      .from(items)
      .where(
        and(
          eq(items.userId, userId),
          parentId === null ? isNull(items.parentId) : eq(items.parentId, parentId),
          eq(items.type, 'folder'),
          isNull(items.trashedAt),
          sql`lower(${items.name}) = lower(${name})`
        )
      );
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const [created]: { id: string }[] = await db
      .insert(items)
      .values({ userId, parentId, type: 'folder', name })
      .returning({ id: items.id });
    parentId = created.id;
  }
  return parentId;
}

export async function trashItem(userId: string, id: string) {
  const item = await getLiveItem(userId, id).catch(() => null);
  if (!item) return null;
  const path = item.parentId
    ? (await ancestorsOf(userId, item.parentId)).map((row) => row.name)
    : [];
  const batch = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.run(sql`UPDATE items SET trashed_at = ${now}, trash_batch = ${batch}
      WHERE trashed_at IS NULL AND id IN (${subtreeQuery(userId, [id])})`),
    db
      .update(items)
      .set({ trashRoot: true, trashPath: path })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
  ]);
  return item;
}

/** Restores a trashed item to its folder, recreating the folder if needed. */
export async function restoreItem(userId: string, id: string) {
  const [item] = await db
    .select({
      id: items.id,
      name: items.name,
      type: items.type,
      parentId: items.parentId,
      trashBatch: items.trashBatch,
      trashPath: items.trashPath
    })
    .from(items)
    .where(
      and(eq(items.id, id), eq(items.userId, userId), eq(items.trashRoot, true))
    );
  if (!item?.trashBatch) return null;

  let parentId = item.parentId;
  if (parentId !== null) {
    const parent = await assertFolder(userId, parentId).catch(() => null);
    if (!parent) parentId = await ensurePath(userId, item.trashPath ?? []);
  }
  const name = uniqueName(
    item.name,
    await childNames(userId, parentId),
    item.type === 'folder'
  );
  await db.batch([
    db
      .update(items)
      .set({ trashedAt: null, trashBatch: null, trashRoot: false })
      .where(and(eq(items.userId, userId), eq(items.trashBatch, item.trashBatch))),
    db
      .update(items)
      .set({ parentId, name, trashPath: null, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
  ]);
  return { ...item, parentId, name };
}

/** Deletes item rows, their share links, and Storage files no longer used. */
export async function purgeRows(
  userId: string,
  rows: { id: string; storageKey: string | null }[]
) {
  for (const part of chunk(rows, 90)) {
    const ids = part.map((row) => row.id);
    await db.batch([
      db.delete(shares).where(and(eq(shares.userId, userId), inArray(shares.itemId, ids))),
      db.delete(items).where(and(eq(items.userId, userId), inArray(items.id, ids)))
    ]);
  }
  const keys = [
    ...new Set(rows.map((row) => row.storageKey).filter((k): k is string => !!k))
  ];
  for (const part of chunk(keys, 90)) {
    const stillUsed = await db
      .select({ key: items.storageKey })
      .from(items)
      .where(inArray(items.storageKey, part));
    const used = new Set(stillUsed.map((row) => row.key));
    const unused = part.filter((key) => !used.has(key));
    if (unused.length) await env.STORAGE.delete(unused);
  }
}

export async function trashedRows(userId: string, batch?: string) {
  return db
    .select({ id: items.id, storageKey: items.storageKey })
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        isNotNull(items.trashedAt),
        batch ? eq(items.trashBatch, batch) : undefined
      )
    );
}

const TEXT_PREVIEW_BYTES = 1024 * 1024;

/** The first megabyte of a text file, for previews. */
export async function readText(storageKey: string) {
  const object = await env.STORAGE.get(storageKey, {
    range: { offset: 0, length: TEXT_PREVIEW_BYTES }
  });
  if (!object) throw new Error('This file is missing from storage.');
  const text = await new Response(object.body).text();
  return { text, truncated: object.size > TEXT_PREVIEW_BYTES };
}

/** Plain-language messages for Storage failures. */
export function storageErrorMessage(error: unknown, name: string): Error {
  switch (getStorageErrorCode(error)) {
    case 'StorageQuotaExceeded':
      return new Error('Stashbox storage is full right now. Delete some files and try again.');
    case 'FileTooLarge':
      return new Error(`“${name}” is too large to upload.`);
    case 'BlockedContent':
      return new Error(`“${name}” was blocked by a safety check.`);
    case 'UploadNotFound':
      return new Error(`The upload of “${name}” expired. Try again.`);
    case 'UploadIncomplete':
      return new Error(`The upload of “${name}” didn’t finish. Try again.`);
    default:
      return error instanceof Error ? error : new Error('Something went wrong.');
  }
}
