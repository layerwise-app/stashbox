# Layerwise project

<a href="https://layerwise.app"><img src="https://layerwise.app/powered-by.png" alt="Powered by Layerwise" width="320" /></a>

This is the starter used for new Layerwise projects. It is a full-stack React
app built with TanStack Start and deployed to Cloudflare Workers. The template
includes Better Auth, a D1 database with Drizzle ORM, Tailwind CSS, shadcn/ui,
and the Layerwise preview bridge.

## Commands

```bash
pnpm dev
pnpm check-types
pnpm build
pnpm auth:generate
pnpm db:generate --name <migration_name>
pnpm db:migrate
pnpm cf-typegen
pnpm release
```

`db:migrate` applies generated Drizzle migrations to the local D1 database.
Layerwise applies the same migrations to the project's production D1 database
during publishing.

## Important files

- `src/routes/`: TanStack Router file routes
- `src/lib/auth.ts`: Better Auth server configuration
- `src/lib/auth.functions.ts`: client-callable server functions
- `src/db/schema.ts`: Drizzle schema
- `vite.config.ts`: Cloudflare, TanStack Start, React, Tailwind, and Layerwise
  plugins
- `wrangler.jsonc`: local Worker, D1, Storage, and Email bindings
- `src/lib/storage.ts`: Layerwise Storage types and helpers for `env.STORAGE`
- `src/lib/email.ts`: Layerwise Email types for `env.EMAIL`
- `src/lib/site.ts`: site name, share image, indexed address, and sitemap pages
- `src/utils/seo.ts`: `seo()` head tags for each route

## Storage

Server code stores files with `env.STORAGE` from `cloudflare:workers`. Files
are private by default; save keys (not URLs) in D1 and show private files with
`env.STORAGE.signedUrl(key)`. The local preview and the published app share the
project's one Storage, so files written while testing are real files.

## Search and sharing

Each route sets its head with `seo({ title, description, path })`, which adds
the canonical URL and the link-preview tags that Google, Instagram, iMessage,
and WhatsApp read. Signed-in and sign-in pages pass `noindex: true`.
`/robots.txt` and `/sitemap.xml` are generated from `src/lib/site.ts`; add each
public page to `sitemapPaths`. After connecting a custom domain, set `site.url`
to it so search engines index one address.

## Email

Server code sends transactional email with `env.EMAIL.send()` from
`cloudflare:workers`: one recipient per email, `html` and/or `text`, and an
optional `replyTo`. It returns `{ data, error }` and never throws for delivery
problems, so check `error.code`. The local preview never sends real email:
messages and sign-in codes appear under Email → Local in the Layerwise app.
Published apps send from the project's address after the first publish.

Keep secrets server-side. Variables prefixed with `VITE_` are included in the
browser bundle. `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `AUTH_EMAIL_URL`
belong in the Worker environment.
