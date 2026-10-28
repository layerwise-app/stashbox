import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import { getPlatformProxy } from 'wrangler';

const platform = await getPlatformProxy({
  configPath: 'wrangler.jsonc',
  remoteBindings: false
});

try {
  await migrate(drizzle(platform.env.DB), { migrationsFolder: 'drizzle' });
} finally {
  await platform.dispose();
}
