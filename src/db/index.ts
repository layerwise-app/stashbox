import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

// `DB` is the Cloudflare D1 binding declared in `wrangler.jsonc`. Import `db`
// only from server code (route loaders, server functions) — it is not available
// in the browser.
export const db = drizzle(env.DB);
