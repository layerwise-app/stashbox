import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '~/db';
import { items, shares, user } from '~/db/schema';
import { authMiddleware } from '~/server/middleware';
import { ancestorsOf, chunk, getLiveItem, itemColumns, readText } from '~/server/items';
import { fileKind, type Crumb } from '~/lib/files';

const SIGNED_URL_SECONDS = 15 * 60;

/**
 * Kinds the share page plays or shows from a file link. Text is read through
 * getSharedFileText instead, so it never needs one.
 */
const PREVIEWABLE = new Set(['image', 'video', 'audio', 'pdf']);

// ---- Passwords and access grants -----------------------------------------

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function randomToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key,
    256
  );
  return toBase64Url(new Uint8Array(bits));
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${toBase64Url(salt)}$${await pbkdf2(password, salt)}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split('$');
  const bytes = Uint8Array.from(
    atob(salt.replaceAll('-', '+').replaceAll('_', '/')),
    (c) => c.charCodeAt(0)
  );
  return (await pbkdf2(password, bytes)) === hash;
}

/**
 * Proof that a visitor entered a link's password. Derived from the stored
 * hash, which never leaves the server, so changing the password revokes it.
 */
async function grantFor(shareId: string, passwordHash: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`share-grant:${shareId}:${passwordHash}`)
  );
  return toBase64Url(new Uint8Array(digest));
}

// ---- Owner: manage links -------------------------------------------------

export type ShareInfo = {
  token: string;
  itemId: string;
  expiresAt: Date | null;
  hasPassword: boolean;
  allowDownload: boolean;
  viewCount: number;
  createdAt: Date;
};

const shareColumns = {
  token: shares.token,
  itemId: shares.itemId,
  expiresAt: shares.expiresAt,
  passwordHash: shares.passwordHash,
  allowDownload: shares.allowDownload,
  viewCount: shares.viewCount,
  createdAt: shares.createdAt
};

function toInfo(row: {
  token: string;
  itemId: string;
  expiresAt: Date | null;
  passwordHash: string | null;
  allowDownload: boolean;
  viewCount: number;
  createdAt: Date;
}): ShareInfo {
  return {
    token: row.token,
    itemId: row.itemId,
    expiresAt: row.expiresAt,
    hasPassword: !!row.passwordHash,
    allowDownload: row.allowDownload,
    viewCount: row.viewCount,
    createdAt: row.createdAt
  };
}

/** Returns the item's link, creating one the first time. */
export const getOrCreateShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { itemId: string }) => ({ itemId: String(input?.itemId ?? '') }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await getLiveItem(userId, data.itemId);
    const [existing] = await db
      .select(shareColumns)
      .from(shares)
      .where(and(eq(shares.itemId, data.itemId), eq(shares.userId, userId)));
    if (existing) return toInfo(existing);
    const [created] = await db
      .insert(shares)
      .values({ token: randomToken(), userId, itemId: data.itemId })
      .returning(shareColumns);
    return toInfo(created);
  });

export const updateShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    (input: {
      itemId: string;
      expiresAt?: string | null;
      allowDownload?: boolean;
      password?: string | null;
    }) => {
      const out: {
        itemId: string;
        expiresAt?: Date | null;
        allowDownload?: boolean;
        password?: string | null;
      } = { itemId: String(input?.itemId ?? '') };
      if (input.expiresAt !== undefined) {
        out.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
        if (out.expiresAt && Number.isNaN(out.expiresAt.getTime()))
          throw new Error('Choose a valid date.');
      }
      if (input.allowDownload !== undefined) out.allowDownload = !!input.allowDownload;
      if (input.password !== undefined) {
        if (input.password !== null && input.password.length < 4)
          throw new Error('Use at least 4 characters for the password.');
        out.password = input.password;
      }
      return out;
    }
  )
  .handler(async ({ data, context }) => {
    const set: Partial<typeof shares.$inferInsert> = {};
    if (data.expiresAt !== undefined) set.expiresAt = data.expiresAt;
    if (data.allowDownload !== undefined) set.allowDownload = data.allowDownload;
    if (data.password !== undefined)
      set.passwordHash = data.password ? await hashPassword(data.password) : null;
    const [row] = await db
      .update(shares)
      .set(set)
      .where(and(eq(shares.itemId, data.itemId), eq(shares.userId, context.user.id)))
      .returning(shareColumns);
    if (!row) throw new Error('This link was turned off.');
    return toInfo(row);
  });

export const deleteShare = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { itemId: string }) => ({ itemId: String(input?.itemId ?? '') }))
  .handler(async ({ data, context }) => {
    await db
      .delete(shares)
      .where(and(eq(shares.itemId, data.itemId), eq(shares.userId, context.user.id)));
  });

export const listShares = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select({
        ...shareColumns,
        name: items.name,
        type: items.type,
        mimeType: items.mimeType,
        trashedAt: items.trashedAt
      })
      .from(shares)
      .innerJoin(items, eq(items.id, shares.itemId))
      .where(eq(shares.userId, context.user.id))
      .orderBy(desc(shares.createdAt));
    return rows.map((row) => ({
      ...toInfo(row),
      name: row.name,
      type: row.type,
      mimeType: row.mimeType,
      inTrash: !!row.trashedAt
    }));
  });

// ---- Visitors: open a link -----------------------------------------------

type Access =
  | { status: 'missing' | 'expired' | 'password' }
  | {
      status: 'ok';
      share: typeof shares.$inferSelect;
      root: Awaited<ReturnType<typeof getLiveItem>>;
    };

async function access(token: string, grant: string | null | undefined): Promise<Access> {
  const [share] = await db.select().from(shares).where(eq(shares.token, token));
  if (!share) return { status: 'missing' };
  const root = await getLiveItem(share.userId, share.itemId).catch(() => null);
  if (!root) return { status: 'missing' };
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return { status: 'expired' };
  if (share.passwordHash && grant !== (await grantFor(share.id, share.passwordHash)))
    return { status: 'password' };
  return { status: 'ok', share, root };
}

/** Breadcrumbs from the shared folder down to `folderId`, or null if outside it. */
async function crumbsWithin(ownerId: string, rootId: string, folderId: string) {
  const chain = await ancestorsOf(ownerId, folderId);
  const start = chain.findIndex((row) => row.id === rootId);
  if (start < 0) return null;
  const inside = chain.slice(start);
  if (inside.some((row) => row.trashed_at !== null)) return null;
  return inside.map((row): Crumb => ({ id: row.id, name: row.name }));
}

/** The file if it is the shared item or inside the shared folder. */
async function fileWithin(result: Extract<Access, { status: 'ok' }>, fileId: string) {
  const file = await getLiveItem(result.share.userId, fileId).catch(() => null);
  if (!file || file.type !== 'file' || !file.storageKey) return null;
  if (file.id !== result.root.id) {
    if (result.root.type !== 'folder' || !file.parentId) return null;
    if (!(await crumbsWithin(result.share.userId, result.root.id, file.parentId)))
      return null;
  }
  return { ...file, storageKey: file.storageKey };
}

async function sharedFile(token: string, grant: string | null | undefined, fileId: string) {
  const result = await access(token, grant);
  if (result.status !== 'ok') throw new Error('This link isn’t available.');
  const file = await fileWithin(result, fileId);
  if (!file) throw new Error('This file isn’t available.');
  return { ...result, file };
}

export const unlockShare = createServerFn({ method: 'POST' })
  .validator((input: { token: string; password: string }) => ({
    token: String(input?.token ?? ''),
    password: String(input?.password ?? '')
  }))
  .handler(async ({ data }) => {
    const [share] = await db.select().from(shares).where(eq(shares.token, data.token));
    if (!share?.passwordHash) throw new Error('This link isn’t available.');
    if (!(await verifyPassword(data.password, share.passwordHash)))
      throw new Error('That password isn’t right.');
    return { grant: await grantFor(share.id, share.passwordHash) };
  });

export const openShare = createServerFn({ method: 'POST' })
  .validator(
    (input: { token: string; grant?: string | null; folderId?: string | null; countView?: boolean }) => ({
      token: String(input?.token ?? ''),
      grant: input?.grant ?? null,
      folderId: input?.folderId || null,
      countView: !!input?.countView
    })
  )
  .handler(async ({ data }) => {
    const result = await access(data.token, data.grant);
    if (result.status !== 'ok') return { status: result.status };
    const { share, root } = result;
    if (data.countView)
      await db
        .update(shares)
        .set({ viewCount: sql`${shares.viewCount} + 1` })
        .where(eq(shares.id, share.id));
    const [owner] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, share.userId));
    const { storageKey: _, ...rootItem } = root;
    const base = {
      status: 'ok' as const,
      ownerName: owner?.name ?? 'Someone',
      allowDownload: share.allowDownload,
      root: rootItem
    };
    if (root.type === 'file') return { ...base, crumbs: [] as Crumb[], items: [] };

    const folderId = data.folderId ?? root.id;
    const crumbs =
      folderId === root.id
        ? [{ id: root.id, name: root.name }]
        : await crumbsWithin(share.userId, root.id, folderId);
    if (!crumbs) return { status: 'missing' as const };
    const children = await db
      .select(itemColumns)
      .from(items)
      .where(
        and(eq(items.userId, share.userId), eq(items.parentId, folderId), isNull(items.trashedAt))
      );
    return { ...base, crumbs, items: children };
  });

export const getSharedFileUrl = createServerFn({ method: 'POST' })
  .validator(
    (input: { token: string; grant?: string | null; fileId: string; download?: boolean }) => ({
      token: String(input?.token ?? ''),
      grant: input?.grant ?? null,
      fileId: String(input?.fileId ?? ''),
      download: !!input?.download
    })
  )
  .handler(async ({ data }) => {
    const { share, file } = await sharedFile(data.token, data.grant, data.fileId);
    if (!share.allowDownload) {
      if (data.download) throw new Error('The owner turned off downloads for this link.');
      // View links are only for files the page can show in place; anything
      // else would just be a download under another name.
      if (!PREVIEWABLE.has(fileKind(file.name, file.mimeType)))
        throw new Error('The owner turned off downloads for this link.');
    }
    return env.STORAGE.signedUrl(file.storageKey, {
      expiresIn: SIGNED_URL_SECONDS,
      download: data.download ? file.name : undefined
    });
  });

/**
 * Short-lived thumbnail links for images and videos in one folder of a shared
 * folder link. Files outside that folder, or of other kinds, are left out.
 */
export const getSharedThumbUrls = createServerFn({ method: 'POST' })
  .validator(
    (input: { token: string; grant?: string | null; folderId?: string | null; ids: string[] }) => {
      if (!Array.isArray(input?.ids)) throw new Error('Choose some files.');
      return {
        token: String(input?.token ?? ''),
        grant: input?.grant ?? null,
        folderId: input?.folderId || null,
        ids: input.ids.map(String).slice(0, 200)
      };
    }
  )
  .handler(async ({ data }) => {
    const result = await access(data.token, data.grant);
    if (result.status !== 'ok') throw new Error('This link isn’t available.');
    const { share, root } = result;
    if (root.type !== 'folder' || !data.ids.length) return {};
    const folderId = data.folderId ?? root.id;
    if (folderId !== root.id && !(await crumbsWithin(share.userId, root.id, folderId)))
      throw new Error('This folder isn’t available.');
    const rows = [];
    for (const part of chunk(data.ids, 90))
      rows.push(
        ...(await db
          .select({
            id: items.id,
            name: items.name,
            mimeType: items.mimeType,
            storageKey: items.storageKey
          })
          .from(items)
          .where(
            and(
              eq(items.userId, share.userId),
              eq(items.parentId, folderId),
              eq(items.type, 'file'),
              isNull(items.trashedAt),
              inArray(items.id, part)
            )
          ))
      );
    const urls: Record<string, string> = {};
    await Promise.all(
      rows.map(async (row) => {
        const kind = fileKind(row.name, row.mimeType);
        if (row.storageKey && (kind === 'image' || kind === 'video'))
          urls[row.id] = await env.STORAGE.signedUrl(row.storageKey, {
            expiresIn: SIGNED_URL_SECONDS
          });
      })
    );
    return urls;
  });

export const getSharedFileText = createServerFn({ method: 'POST' })
  .validator((input: { token: string; grant?: string | null; fileId: string }) => ({
    token: String(input?.token ?? ''),
    grant: input?.grant ?? null,
    fileId: String(input?.fileId ?? '')
  }))
  .handler(async ({ data }) => {
    const { file } = await sharedFile(data.token, data.grant, data.fileId);
    return readText(file.storageKey);
  });
