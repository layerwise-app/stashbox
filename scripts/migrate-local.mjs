import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Applies Drizzle migrations to the local D1 database that `vite dev` uses.
// Miniflare keeps it in this folder; metadata.sqlite is its own bookkeeping.
const stateDir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const databaseFile = existsSync(stateDir)
  ? readdirSync(stateDir).find(
      (name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite'
    )
  : undefined;

if (databaseFile) {
  // Opening the file directly needs no local server, so this also works
  // where listening on localhost is blocked, such as a sandboxed shell.
  const { DatabaseSync } = await import('node:sqlite');
  const { drizzle } = await import('drizzle-orm/node-sqlite');
  const { migrate } = await import('drizzle-orm/node-sqlite/migrator');
  const client = new DatabaseSync(join(stateDir, databaseFile));
  try {
    // The running preview can hold a write lock for a moment.
    client.exec('PRAGMA busy_timeout = 5000');
    await migrate(drizzle({ client }), { migrationsFolder: 'drizzle' });
  } finally {
    client.close();
  }
} else {
  // Before the first run, only wrangler knows where to create the file.
  const { drizzle } = await import('drizzle-orm/d1');
  const { migrate } = await import('drizzle-orm/d1/migrator');
  const { getPlatformProxy } = await import('wrangler');
  const platform = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    remoteBindings: false
  });
  try {
    await migrate(drizzle(platform.env.DB), { migrationsFolder: 'drizzle' });
  } finally {
    await platform.dispose();
  }
}
