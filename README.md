<a href="https://layerwise.app"><picture><source media="(prefers-color-scheme: dark)" srcset="https://layerwise.app/powered-by-dark.png"><img src="https://layerwise.app/powered-by.png" alt="Powered by Layerwise" width="174" height="28"></picture></a>

# Stashbox

Stashbox is a Dropbox-style file storage app: people sign up, upload files and
whole folders, organize them, preview them in the browser, and share them with
a link. It's a template for anyone who wants their own private file locker,
for a family, a club, or a small business that sends files to clients. See the
live demo at https://stashbox.layerwise.site/.

Stashbox was built with [Layerwise](https://layerwise.app), and you can open it
in Layerwise to make your own version.

It's a full-stack React app built with TanStack Start and deployed to
Cloudflare Workers, with Better Auth, a D1 database with Drizzle ORM, Tailwind
CSS, shadcn/ui, and Layerwise Storage.

## Make it yours

- **Name and search:** the site name and description are in
  `src/lib/site.ts`. After connecting a custom domain, set `site.url` there.
- **Logo and icons:** the logo is `src/components/logo.tsx`; the favicons and
  app icons are in `public/`.
- **Words:** the landing page is `src/routes/index.tsx`.
- **Storage per person:** `PLAN_NAME` and `PLAN_LIMIT_BYTES` in
  `src/lib/files.ts` (2 GB by default). Files in Trash count toward it.

## What's inside

- **File browser** (`src/components/files/`): a resizable sidebar with All
  files, Recent, Starred, Shared links, and Trash, and a storage meter.
  Breadcrumbs, list and grid views, sortable columns, nested folders in the
  URL, multi-select with click, Cmd/Ctrl, Shift, and Cmd+A, a selection
  toolbar, and a context menu.
- **Uploads** (`uploads.tsx`): files and folders, by button or drag and drop,
  sent straight to Storage with presigned URLs. A progress panel can cancel
  each upload, and duplicate names become `name (1)`.
- **Preview** (`preview.tsx`): images, PDFs, video, audio, text, Markdown,
  and code, full screen, with arrow keys to move between files.
- **Organize:** rename inline, move or copy with a folder picker, star, and
  search by name with each result's location. Downloading a folder or several
  items at once gives one ZIP, streamed by `src/routes/api/zip.ts`. Trash restores items to their
  folder, recreating it if it was deleted too.
- **Share links** (`share-dialog.tsx`, `src/routes/s.$token.tsx`): each file
  or folder gets a link with an optional expiry date, password, and download
  switch. The Shared links page shows view counts. Access is checked on the server, and files are
  served through short-lived signed URLs.
- **Settings** (`src/routes/dashboard/settings.tsx`): profile photo, name,
  appearance, password, sign out of other devices, and account deletion,
  which removes every file and share link.
- **Data:** names and folders live in D1 (`src/db/schema.ts`); file bytes live
  in Storage under generated keys, so renames and moves never copy data.

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
