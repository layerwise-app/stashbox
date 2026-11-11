import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '~/db';
import { items, shares, uploads } from '~/db/schema';
import {
  PLAN_LIMIT_BYTES,
  PLAN_NAME,
  cleanName,
  formatBytes,
  guessMimeType,
  uniqueName,
  type Item
} from '~/lib/files';
import { authMiddleware } from '~/server/middleware';
import {
  ancestorsOf,
  assertFolder,
  assertNameFree,
  bytesUsed,
  childNames,
  chunk,
  crumbsFor,
  getLiveItem,
  itemColumns,
  purgeRows,
  readText,
  relocate,
  restoreItem,
  storageErrorMessage,
  subtreeQuery,
  trashItem,
  trashedRows
} from '~/server/items';

const SIGNED_URL_SECONDS = 15 * 60;

// ---- Input validation ----------------------------------------------------

function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Missing ${field}.`);
  return value;
}
function optId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Choose at least one item.');
  if (value.length > 1000) throw new Error('Choose fewer items.');
  return value.map((v) => str(v, 'item'));
}

// ---- Listing -------------------------------------------------------------

type FolderNode = { id: string; name: string; parentId: string | null };

async function liveFolders(userId: string): Promise<Map<string, FolderNode>> {
  const folders = await db
    .select({ id: items.id, name: items.name, parentId: items.parentId })
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.type, 'folder'), isNull(items.trashedAt)));
  return new Map(folders.map((f) => [f.id, f]));
}

/**
 * Marks items that have a link of their own, and items reachable through the
 * link of a folder above them (`sharedVia`, the nearest such folder).
 */
async function withShared(
  userId: string,
  rows: Item[],
  folders?: Map<string, FolderNode>
): Promise<Item[]> {
  if (!rows.length) return rows;
  const links = await db
    .select({ itemId: shares.itemId })
    .from(shares)
    .where(eq(shares.userId, userId));
  const shared = new Set(links.map((link) => link.itemId));
  if (!shared.size) return rows.map((row) => ({ ...row, shared: false }));
  const byId = folders ?? (await liveFolders(userId));
  return rows.map((row) => {
    if (shared.has(row.id)) return { ...row, shared: true };
    for (let cur = row.parentId, guard = 0; cur && guard < 1000; guard++) {
      const folder = byId.get(cur);
      if (!folder) break;
      if (shared.has(folder.id))
        return { ...row, shared: false, sharedVia: { id: folder.id, name: folder.name } };
      cur = folder.parentId;
    }
    return { ...row, shared: false };
  });
}

/** Adds each item's folder path, for lists that span folders. */
async function withLocations(userId: string, rows: Item[]): Promise<Item[]> {
  const byId = await liveFolders(userId);
  const pathOf = (id: string | null): string => {
    const names: string[] = [];
    for (let cur = id, guard = 0; cur && guard < 1000; guard++) {
      const folder = byId.get(cur);
      if (!folder) break;
      names.unshift(folder.name);
      cur = folder.parentId;
    }
    return ['All files', ...names].join(' / ');
  };
  return withShared(
    userId,
    rows.map((row) => ({ ...row, location: { id: row.parentId, path: pathOf(row.parentId) } })),
    byId
  );
}

export const getStorageInfo = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [used, usage, [trash]] = await Promise.all([
      bytesUsed(context.user.id),
      env.STORAGE.usage(),
      db
        .select({ total: sql<number>`coalesce(sum(${items.size}), 0)` })
        .from(items)
        .where(and(eq(items.userId, context.user.id), eq(items.type, 'file'), isNotNull(items.trashedAt)))
    ]);
    return {
      usedBytes: used,
      trashBytes: Number(trash?.total ?? 0),
      limitBytes: PLAN_LIMIT_BYTES,
      planName: PLAN_NAME,
      maxFileBytes: usage.maxFileBytes,
      storageFull: usage.readOnly
    };
  });

export const listFolder = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: { folderId?: string | null }) => ({
    folderId: optId(input?.folderId)
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    const folder = await assertFolder(userId, data.folderId);
    const rows = await db
      .select(itemColumns)
      .from(items)
      .where(
        and(
          eq(items.userId, userId),
          data.folderId ? eq(items.parentId, data.folderId) : isNull(items.parentId),
          isNull(items.trashedAt)
        )
      );
    return {
      folder: folder ? { id: folder.id, name: folder.name } : null,
      crumbs: await crumbsFor(userId, data.folderId),
      items: await withShared(userId, rows)
    };
  });

export const listFolders = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: { folderId?: string | null }) => ({
    folderId: optId(input?.folderId)
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await assertFolder(userId, data.folderId);
    const folders = await db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(
        and(
          eq(items.userId, userId),
          eq(items.type, 'folder'),
          data.folderId ? eq(items.parentId, data.folderId) : isNull(items.parentId),
          isNull(items.trashedAt)
        )
      )
      .orderBy(sql`lower(${items.name})`);
    return { crumbs: await crumbsFor(userId, data.folderId), folders };
  });

export const listStarred = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select(itemColumns)
      .from(items)
      .where(
        and(eq(items.userId, context.user.id), eq(items.starred, true), isNull(items.trashedAt))
      );
    return withLocations(context.user.id, rows);
  });

export const listRecent = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select(itemColumns)
      .from(items)
      .where(
        and(
          eq(items.userId, context.user.id),
          eq(items.type, 'file'),
          isNull(items.trashedAt),
          isNotNull(items.recentAt)
        )
      )
      .orderBy(desc(items.recentAt))
      .limit(50);
    return withLocations(context.user.id, rows);
  });

export const searchItems = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: { q: string }) => ({ q: String(input?.q ?? '').trim() }))
  .handler(async ({ data, context }) => {
    if (!data.q) return [];
    const pattern = `%${data.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await db
      .select(itemColumns)
      .from(items)
      .where(
        and(
          eq(items.userId, context.user.id),
          isNull(items.trashedAt),
          sql`${items.name} LIKE ${pattern} ESCAPE '\\'`
        )
      )
      .orderBy(asc(items.type), sql`lower(${items.name})`)
      .limit(200);
    return withLocations(context.user.id, rows);
  });

export const listTrash = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.user.id;
    const roots = await db
      .select({
        ...itemColumns,
        trashedAt: items.trashedAt,
        trashBatch: items.trashBatch,
        trashPath: items.trashPath
      })
      .from(items)
      .where(and(eq(items.userId, userId), eq(items.trashRoot, true), isNotNull(items.trashedAt)))
      .orderBy(desc(items.trashedAt));
    // Folder sizes: everything deleted along with the folder.
    const sizes = await db
      .select({ batch: items.trashBatch, total: sql<number>`sum(${items.size})` })
      .from(items)
      .where(and(eq(items.userId, userId), isNotNull(items.trashedAt)))
      .groupBy(items.trashBatch);
    const sizeOf = new Map(sizes.map((row) => [row.batch, Number(row.total)]));
    return roots.map(({ trashBatch, trashPath, ...row }) => ({
      ...row,
      size: sizeOf.get(trashBatch) ?? row.size,
      trashedAt: row.trashedAt!,
      originalPath: ['All files', ...(trashPath ?? [])].join(' / ')
    }));
  });

// ---- File contents -------------------------------------------------------

export const getSignedUrls = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[] }) => ({ ids: ids(input?.ids).slice(0, 200) }))
  .handler(async ({ data, context }) => {
    const rows = await db
      .select({ id: items.id, storageKey: items.storageKey })
      .from(items)
      .where(
        and(eq(items.userId, context.user.id), inArray(items.id, data.ids), isNull(items.trashedAt))
      );
    const urls: Record<string, string> = {};
    await Promise.all(
      rows.map(async (row) => {
        if (row.storageKey)
          urls[row.id] = await env.STORAGE.signedUrl(row.storageKey, {
            expiresIn: SIGNED_URL_SECONDS
          });
      })
    );
    return urls;
  });

export const getFileUrl = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { id: string; download?: boolean }) => ({
    id: str(input?.id, 'file'),
    download: !!input?.download
  }))
  .handler(async ({ data, context }) => {
    const file = await getLiveItem(context.user.id, data.id);
    if (file.type !== 'file' || !file.storageKey) throw new Error('That isn’t a file.');
    return env.STORAGE.signedUrl(file.storageKey, {
      expiresIn: SIGNED_URL_SECONDS,
      download: data.download ? file.name : undefined
    });
  });

/** Records that a file was opened, for Recent. */
export const markOpened = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 'file') }))
  .handler(async ({ data, context }) => {
    await db
      .update(items)
      .set({ recentAt: new Date() })
      .where(and(eq(items.id, data.id), eq(items.userId, context.user.id), eq(items.type, 'file')));
  });

export const getFileText = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 'file') }))
  .handler(async ({ data, context }) => {
    const file = await getLiveItem(context.user.id, data.id);
    if (!file.storageKey) throw new Error('That isn’t a file.');
    return readText(file.storageKey);
  });

// ---- Creating ------------------------------------------------------------

export const createFolder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { parentId: string | null; name: string }) => ({
    parentId: optId(input?.parentId),
    name: cleanName(String(input?.name ?? ''))
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await assertFolder(userId, data.parentId);
    await assertNameFree(userId, data.parentId, data.name);
    const [folder] = await db
      .insert(items)
      .values({ userId, parentId: data.parentId, type: 'folder', name: data.name })
      .returning(itemColumns);
    return folder;
  });

/**
 * Creates the folders of an uploaded folder. `paths` are relative folder
 * paths like "Photos" and "Photos/2024"; a top-level folder whose name is
 * taken gets a new name. Returns the folder ID for each path.
 */
export const createFolderTree = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { parentId: string | null; paths: string[] }) => {
    if (!Array.isArray(input?.paths) || input.paths.length > 5000)
      throw new Error('Too many folders.');
    return {
      parentId: optId(input.parentId),
      paths: input.paths.map((p) => String(p).split('/').map(cleanName).join('/'))
    };
  })
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await assertFolder(userId, data.parentId);
    const taken = await childNames(userId, data.parentId);
    const sorted = [...new Set(data.paths)].sort(
      (a, b) => a.split('/').length - b.split('/').length
    );
    const ids: Record<string, string> = {};
    // A renamed top-level folder ("Photos (1)") keeps the paths the browser
    // knows; only the stored name changes.
    const rows: (typeof items.$inferInsert)[] = [];
    for (const path of sorted) {
      const parts = path.split('/');
      const parentPath = parts.slice(0, -1).join('/');
      if (parentPath && !ids[parentPath]) continue;
      const parentId = parentPath ? ids[parentPath] : data.parentId;
      let name = parts[parts.length - 1];
      if (!parentPath) {
        name = uniqueName(name, taken, true);
        taken.push(name);
      }
      const id = crypto.randomUUID();
      ids[path] = id;
      rows.push({ id, userId, parentId, type: 'folder', name });
    }
    for (const part of chunk(rows, 50)) {
      const [first, ...rest] = part.map((row) => db.insert(items).values(row));
      await db.batch([first, ...rest]);
    }
    return ids;
  });

export const createTextFile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { parentId: string | null; name: string; content: string }) => {
    const content = String(input?.content ?? '');
    if (content.length > 5_000_000) throw new Error('That text is too long.');
    return { parentId: optId(input?.parentId), name: cleanName(String(input?.name ?? '')), content };
  })
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await assertFolder(userId, data.parentId);
    const name = uniqueName(data.name, await childNames(userId, data.parentId));
    const bytes = new TextEncoder().encode(data.content);
    if ((await bytesUsed(userId)) + bytes.byteLength > PLAN_LIMIT_BYTES)
      throw new Error('Your Stashbox is full. Delete some files to make room.');
    const storageKey = `files/${userId}/${crypto.randomUUID()}`;
    const mimeType = guessMimeType(name) === 'application/octet-stream'
      ? 'text/plain'
      : guessMimeType(name);
    try {
      await env.STORAGE.put(storageKey, bytes, {
        contentType: `${mimeType}; charset=utf-8`,
        customMetadata: { name }
      });
    } catch (error) {
      throw storageErrorMessage(error, name);
    }
    const [file] = await db
      .insert(items)
      .values({
        userId,
        parentId: data.parentId,
        type: 'file',
        name,
        storageKey,
        size: bytes.byteLength,
        mimeType,
        recentAt: new Date()
      })
      .returning(itemColumns);
    return file;
  });

// ---- Uploads -------------------------------------------------------------

/** Checks a file against the limits, then returns a direct upload link. */
export const startUpload = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { parentId: string | null; name: string; size: number; type: string }) => {
    const size = Number(input?.size);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid file size.');
    const name = cleanName(String(input?.name ?? ''));
    return { parentId: optId(input?.parentId), name, size, type: guessMimeType(name, input?.type) };
  })
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await assertFolder(userId, data.parentId);
    const usage = await env.STORAGE.usage();
    if (data.size > usage.maxFileBytes)
      throw new Error(
        `“${data.name}” is ${formatBytes(data.size)}. Files can be up to ${formatBytes(usage.maxFileBytes)}.`
      );
    const used = await bytesUsed(userId);
    if (used + data.size > PLAN_LIMIT_BYTES) {
      const left = Math.max(0, PLAN_LIMIT_BYTES - used);
      throw new Error(
        `Not enough space for “${data.name}” (${formatBytes(data.size)}). You have ${formatBytes(left)} left.`
      );
    }
    if (
      usage.readOnly ||
      (usage.limitBytes !== null &&
        usage.usedBytes + usage.reservedBytes + data.size > usage.limitBytes)
    )
      throw new Error('Stashbox storage is full right now. Delete some files and try again.');

    const storageKey = `files/${userId}/${crypto.randomUUID()}`;
    // Empty files have nothing to send; store them right away.
    if (data.size === 0) {
      await env.STORAGE.put(storageKey, '', { contentType: data.type });
      const name = uniqueName(data.name, await childNames(userId, data.parentId));
      const [file] = await db
        .insert(items)
        .values({ userId, parentId: data.parentId, type: 'file', name, storageKey, size: 0, mimeType: data.type, recentAt: new Date() })
        .returning(itemColumns);
      return { done: true as const, item: file };
    }
    try {
      const upload = await env.STORAGE.createUpload({
        key: storageKey,
        size: data.size,
        contentType: data.type,
        customMetadata: { name: data.name }
      });
      await db.insert(uploads).values({
        id: upload.id,
        userId,
        parentId: data.parentId,
        name: data.name,
        size: data.size,
        mimeType: data.type,
        storageKey
      });
      return { done: false as const, id: upload.id, url: upload.url, headers: upload.headers };
    } catch (error) {
      throw storageErrorMessage(error, data.name);
    }
  });

export const finishUpload = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 'upload') }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    const [upload] = await db
      .select()
      .from(uploads)
      .where(and(eq(uploads.id, data.id), eq(uploads.userId, userId)));
    if (!upload) throw new Error('That upload expired. Try again.');
    try {
      await env.STORAGE.completeUpload(upload.id);
    } catch (error) {
      throw storageErrorMessage(error, upload.name);
    }
    // If the folder was deleted meanwhile, the file lands in All files.
    const parent = await assertFolder(userId, upload.parentId).catch(() => null);
    const parentId = parent ? parent.id : null;
    const name = uniqueName(upload.name, await childNames(userId, parentId));
    const [, [file]] = await db.batch([
      db.delete(uploads).where(eq(uploads.id, upload.id)),
      db
        .insert(items)
        .values({
          userId,
          parentId,
          type: 'file',
          name,
          storageKey: upload.storageKey,
          size: upload.size,
          mimeType: upload.mimeType,
          recentAt: new Date()
        })
        .returning(itemColumns)
    ]);
    return file;
  });

export const cancelUpload = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: str(input?.id, 'upload') }))
  .handler(async ({ data, context }) => {
    await db
      .delete(uploads)
      .where(and(eq(uploads.id, data.id), eq(uploads.userId, context.user.id)));
  });

// ---- Organizing ----------------------------------------------------------

export const renameItem = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { id: string; name: string }) => ({
    id: str(input?.id, 'item'),
    name: cleanName(String(input?.name ?? ''))
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    const item = await getLiveItem(userId, data.id);
    if (item.name === data.name) return { name: item.name };
    await assertNameFree(userId, item.parentId, data.name, item.id);
    await db
      .update(items)
      .set({ name: data.name, updatedAt: new Date() })
      .where(and(eq(items.id, item.id), eq(items.userId, userId)));
    return { name: data.name };
  });

export const setStarred = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[]; starred: boolean }) => ({
    ids: ids(input?.ids),
    starred: !!input?.starred
  }))
  .handler(async ({ data, context }) => {
    for (const part of chunk(data.ids, 90))
      await db
        .update(items)
        .set({ starred: data.starred })
        .where(and(eq(items.userId, context.user.id), inArray(items.id, part)));
  });

export const moveItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[]; targetId: string | null }) => ({
    ids: ids(input?.ids),
    targetId: optId(input?.targetId)
  }))
  .handler(async ({ data, context }) => {
    const previous = await relocate(
      context.user.id,
      data.ids.map((id) => ({ id, parentId: data.targetId }))
    );
    return { previous };
  });

/** Puts items back where they were (Undo after Move). */
export const putBack = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { entries: { id: string; parentId: string | null; name: string }[] }) => {
    if (!Array.isArray(input?.entries)) throw new Error('Nothing to undo.');
    return {
      entries: input.entries.map((e) => ({
        id: str(e.id, 'item'),
        parentId: optId(e.parentId),
        name: cleanName(String(e.name ?? ''))
      }))
    };
  })
  .handler(async ({ data, context }) => {
    await relocate(context.user.id, data.entries);
  });

export const copyItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[]; targetId: string | null }) => ({
    ids: ids(input?.ids),
    targetId: optId(input?.targetId)
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await assertFolder(userId, data.targetId);
    const chain = data.targetId ? await ancestorsOf(userId, data.targetId) : [];
    const roots = await db
      .select({ id: items.id, name: items.name, type: items.type })
      .from(items)
      .where(and(eq(items.userId, userId), inArray(items.id, data.ids), isNull(items.trashedAt)));
    for (const root of roots)
      if (root.type === 'folder' && chain.some((row) => row.id === root.id))
        throw new Error(`You can’t copy “${root.name}” into itself.`);

    // Everything to copy, read before writing anything.
    const rows = await db.all<{
      id: string; parent_id: string | null; type: 'file' | 'folder'; name: string;
      storage_key: string | null; size: number; mime_type: string | null;
    }>(sql`SELECT id, parent_id, type, name, storage_key, size, mime_type FROM items
      WHERE trashed_at IS NULL AND id IN (${subtreeQuery(userId, roots.map((r) => r.id))})`);
    const extra = rows.reduce((sum, row) => sum + (row.type === 'file' ? row.size : 0), 0);
    if ((await bytesUsed(userId)) + extra > PLAN_LIMIT_BYTES)
      throw new Error(`Not enough space to copy ${formatBytes(extra)}.`);

    const newId = new Map(rows.map((row) => [row.id, crypto.randomUUID()]));
    const rootIds = new Set(roots.map((r) => r.id));
    const taken = await childNames(userId, data.targetId);
    const now = new Date();
    const inserts = rows.map((row) => {
      let name = row.name;
      let parentId: string | null = row.parent_id ? newId.get(row.parent_id) ?? null : null;
      if (rootIds.has(row.id)) {
        parentId = data.targetId;
        name = uniqueName(row.name, taken, row.type === 'folder');
        taken.push(name);
      }
      return db.insert(items).values({
        id: newId.get(row.id)!,
        userId,
        parentId,
        type: row.type,
        name,
        storageKey: row.storage_key,
        size: row.size,
        mimeType: row.mime_type,
        createdAt: now,
        updatedAt: now
      });
    });
    for (const part of chunk(inserts, 50)) {
      const [first, ...rest] = part;
      await db.batch([first, ...rest]);
    }
    return { count: roots.length };
  });

// ---- Trash ---------------------------------------------------------------

export const trashItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[] }) => ({ ids: ids(input?.ids) }))
  .handler(async ({ data, context }) => {
    const trashed: string[] = [];
    for (const id of data.ids) {
      if (await trashItem(context.user.id, id)) trashed.push(id);
    }
    return { ids: trashed };
  });

export const restoreItems = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[] }) => ({ ids: ids(input?.ids) }))
  .handler(async ({ data, context }) => {
    const restored: { id: string; name: string; parentId: string | null }[] = [];
    for (const id of data.ids) {
      const item = await restoreItem(context.user.id, id);
      if (item) restored.push({ id: item.id, name: item.name, parentId: item.parentId });
    }
    return restored;
  });

export const deleteForever = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { ids: string[] }) => ({ ids: ids(input?.ids) }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    const roots = await db
      .select({ batch: items.trashBatch })
      .from(items)
      .where(
        and(eq(items.userId, userId), inArray(items.id, data.ids), eq(items.trashRoot, true))
      );
    for (const root of roots) {
      if (root.batch) await purgeRows(userId, await trashedRows(userId, root.batch));
    }
  });

export const emptyTrash = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await purgeRows(context.user.id, await trashedRows(context.user.id));
  });
