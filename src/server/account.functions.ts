import { createServerFn } from '@tanstack/react-start';
import { getCookie, getRequestHeaders } from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '~/db';
import { account, items, session, shares, uploads, user } from '~/db/schema';
import { auth } from '~/lib/auth';
import { authMiddleware } from '~/server/middleware';
import { chunk } from '~/server/items';

// ---- Sidebar layout ------------------------------------------------------

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 256;

/** The sidebar's saved width and open state, so the first paint matches. */
export const getSidebarPrefs = createServerFn({ method: 'GET' }).handler(() => {
  const width = Number(getCookie('sidebar_width'));
  return {
    open: getCookie('sidebar_state') !== 'false',
    width:
      Number.isFinite(width) && width >= SIDEBAR_MIN_WIDTH && width <= SIDEBAR_MAX_WIDTH
        ? width
        : SIDEBAR_DEFAULT_WIDTH
  };
});

// ---- Profile -------------------------------------------------------------

const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Only keys this app wrote for this user count as their photo. */
function avatarKeyOf(userId: string, image: string | null | undefined) {
  return image?.startsWith(`avatars/${userId}/`) ? image : null;
}

async function hasPassword(userId: string) {
  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, 'credential'), isNotNull(account.password))
    );
  return !!credential;
}

export const getProfile = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [row] = await db
      .select({
        name: user.name,
        email: user.email,
        image: user.image,
        createdAt: user.createdAt
      })
      .from(user)
      .where(eq(user.id, context.user.id));
    if (!row) throw new Error('Please sign in again.');
    const key = avatarKeyOf(context.user.id, row.image);
    return {
      name: row.name,
      email: row.email,
      createdAt: row.createdAt,
      avatarUrl: key ? await env.STORAGE.signedUrl(key, { expiresIn: 3600 }) : null,
      hasPassword: await hasPassword(context.user.id)
    };
  });

export const updateName = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { name: string }) => {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Enter your name.');
    if (name.length > 80) throw new Error('Use 80 characters or fewer.');
    return { name };
  })
  .handler(async ({ data, context }) => {
    await db
      .update(user)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(user.id, context.user.id));
    return { name: data.name };
  });

export const uploadAvatar = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((data: FormData) => {
    const file = data.get('file');
    if (!(file instanceof File)) throw new Error('Choose a photo.');
    if (!AVATAR_TYPES.has(file.type)) throw new Error('Use a PNG, JPG, WebP, or GIF image.');
    if (file.size > AVATAR_MAX_BYTES) throw new Error('Choose a photo under 5 MB.');
    return file;
  })
  .handler(async ({ data: file, context }) => {
    const userId = context.user.id;
    const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
    const key = `avatars/${userId}/${crypto.randomUUID()}`;
    await env.STORAGE.put(key, file.stream(), { size: file.size, contentType: file.type });
    await db.update(user).set({ image: key, updatedAt: new Date() }).where(eq(user.id, userId));
    const old = avatarKeyOf(userId, row?.image);
    if (old) await env.STORAGE.delete(old).catch(() => {});
  });

export const removeAvatar = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.user.id;
    const [row] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
    await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, userId));
    const old = avatarKeyOf(userId, row?.image);
    if (old) await env.STORAGE.delete(old).catch(() => {});
  });

/** Adds a password for people who have only signed in with email codes. */
export const setPassword = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { newPassword: string }) => ({ newPassword: String(input?.newPassword ?? '') }))
  .handler(async ({ data, context }) => {
    if (await hasPassword(context.user.id)) throw new Error('You already have a password.');
    await auth.api.setPassword({
      body: { newPassword: data.newPassword },
      headers: getRequestHeaders()
    });
  });

/**
 * Deletes the account with all of its files, folders, share links, and
 * sessions. People with a password must enter it; everyone types their email.
 */
export const deleteAccount = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator((input: { confirmEmail: string; password?: string }) => ({
    confirmEmail: String(input?.confirmEmail ?? '').trim().toLowerCase(),
    password: input?.password ? String(input.password) : undefined
  }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    if (data.confirmEmail !== context.user.email.toLowerCase())
      throw new Error('Type your email address exactly to confirm.');
    if (await hasPassword(userId)) {
      if (!data.password) throw new Error('Enter your password.');
      try {
        await auth.api.verifyPassword({ body: { password: data.password }, headers: getRequestHeaders() });
      } catch {
        throw new Error('That password isn’t right.');
      }
    }

    // Files first: once the rows are gone, nothing points at them.
    const rows = await db
      .selectDistinct({ key: items.storageKey })
      .from(items)
      .where(and(eq(items.userId, userId), isNotNull(items.storageKey)));
    const [profile] = await db.select({ image: user.image }).from(user).where(eq(user.id, userId));
    const keys = rows.map((row) => row.key!).filter(Boolean);
    const avatar = avatarKeyOf(userId, profile?.image);
    if (avatar) keys.push(avatar);
    for (const part of chunk(keys, 100)) await env.STORAGE.delete(part);

    await db.batch([
      db.delete(shares).where(eq(shares.userId, userId)),
      db.delete(uploads).where(eq(uploads.userId, userId)),
      db.delete(items).where(eq(items.userId, userId)),
      db.delete(session).where(eq(session.userId, userId)),
      db.delete(account).where(eq(account.userId, userId)),
      db.delete(user).where(eq(user.id, userId))
    ]);
  });
