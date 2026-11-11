import { createFileRoute } from '@tanstack/react-router';
import { env } from 'cloudflare:workers';
import { sql } from 'drizzle-orm';
import { db } from '~/db';
import { auth } from '~/lib/auth';
import { idList } from '~/server/items';
import { zipStream, type ZipEntry } from '~/server/zip';

// GET /api/zip?ids=a,b&name=Photos — the signed-in user's items as one ZIP.
export const Route = createFileRoute('/api/zip')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response('Please sign in again.', { status: 401 });
        const url = new URL(request.url);
        const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 500);
        if (!ids.length) return new Response('Choose something to download.', { status: 400 });
        const userId = session.user.id;

        const rows = await db.all<{
          id: string; type: 'file' | 'folder'; storage_key: string | null;
          updated_at: number; path: string;
        }>(sql`
          WITH RECURSIVE tree(id, type, storage_key, updated_at, path, depth) AS (
            SELECT id, type, storage_key, updated_at, name, 0 FROM items
            WHERE user_id = ${userId} AND trashed_at IS NULL AND id IN (${idList(ids)})
            UNION ALL
            SELECT i.id, i.type, i.storage_key, i.updated_at, t.path || '/' || i.name, t.depth + 1
            FROM items i JOIN tree t ON i.parent_id = t.id
            WHERE i.user_id = ${userId} AND i.trashed_at IS NULL AND t.type = 'folder' AND t.depth < 1000
          ) SELECT id, type, storage_key, updated_at, path FROM tree ORDER BY path`);
        if (!rows.length) return new Response('Nothing to download.', { status: 404 });

        // Two selected items with the same name (from search) can't share a path.
        const seen = new Set<string>();
        const entries: ZipEntry[] = rows.map((row) => {
          let path = row.path.replace(/[\\:*?"<>|]/g, '_');
          for (let n = 1; seen.has(path.toLowerCase()); n++) path = `${row.path} (${n})`;
          seen.add(path.toLowerCase());
          return {
            path,
            isDir: row.type === 'folder',
            date: new Date(row.updated_at),
            open: async () =>
              row.storage_key ? (await env.STORAGE.get(row.storage_key))?.body ?? null : null
          };
        });

        const name = (url.searchParams.get('name') || 'Stashbox').replace(/["\\/\r\n]/g, '_');
        return new Response(zipStream(entries), {
          headers: {
            'content-type': 'application/zip',
            'content-disposition': `attachment; filename="${name}.zip"; filename*=UTF-8''${encodeURIComponent(name)}.zip`,
            'cache-control': 'no-store'
          }
        });
      }
    }
  }
});
