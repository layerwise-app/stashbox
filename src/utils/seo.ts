import { site, siteUrl } from '~/lib/site';

type JsonLd = { [key: string]: unknown };

export type SeoOptions = {
  title: string;
  description?: string;
  /** This page's path, like `/menu`. Sets its canonical URL and `og:url`. */
  path?: string;
  /** Share image: a `public/` path or an absolute URL. Defaults to `site.image`. */
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  /** Keeps the page out of search results, like sign-in pages and dashboards. */
  noindex?: boolean;
  /** schema.org structured data, like a LocalBusiness or Product. */
  jsonLd?: JsonLd | JsonLd[];
};

/** Head tags for a route: `head: () => seo({ title, path: '/menu' })`. */
export function seo({
  title,
  description,
  path,
  image = site.image,
  imageAlt = image === site.image ? site.imageAlt : '',
  type = 'website',
  noindex = false,
  jsonLd
}: SeoOptions) {
  const url = path ? siteUrl(path) : undefined;
  const imageUrl = image ? siteUrl(image) : undefined;

  const meta = [
    { title },
    ...(description ? [{ name: 'description', content: description }] : []),
    ...(noindex ? [{ name: 'robots', content: 'noindex' }] : []),
    // Open Graph consumers (Instagram, Facebook, iMessage, WhatsApp) read
    // `property`, not `name`, and need absolute URLs.
    { property: 'og:type', content: type },
    { property: 'og:site_name', content: site.name },
    { property: 'og:title', content: title },
    ...(description
      ? [{ property: 'og:description', content: description }]
      : []),
    ...(url ? [{ property: 'og:url', content: url }] : []),
    ...(imageUrl
      ? [
          { property: 'og:image', content: imageUrl },
          ...(imageAlt
            ? [{ property: 'og:image:alt', content: imageAlt }]
            : []),
          { name: 'twitter:image', content: imageUrl }
        ]
      : []),
    {
      name: 'twitter:card',
      content: imageUrl ? 'summary_large_image' : 'summary'
    },
    { name: 'twitter:title', content: title },
    ...(description
      ? [{ name: 'twitter:description', content: description }]
      : [])
  ];

  // A noindex page has no canonical address to point search engines at.
  const links = url && !noindex ? [{ rel: 'canonical', href: url }] : [];

  const scripts = (jsonLd ? [jsonLd].flat() : []).map((data) => ({
    type: 'application/ld+json',
    // Escape `<` so a value can't close the script tag.
    children: JSON.stringify(data).replaceAll('<', '\\u003c')
  }));

  return { meta, links, scripts };
}
