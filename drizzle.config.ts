import { defineConfig } from 'drizzle-kit';

// Migrations are generated locally with `pnpm run db:generate` and applied to the
// production D1 database automatically when the app is published. No database
// credentials are needed here.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle'
});
