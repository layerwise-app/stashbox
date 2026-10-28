import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';

type Site = {
  name: string;
  description: string;
  /**
   * The address search engines should index, like `https://bloombakery.com`.
   * Empty uses the address each visitor opened. Set it when a custom domain is
   * connected, so the layerwise.site address isn't indexed as a copy.
   */
  url: string;
  /**
   * Share image for link previews on Instagram, iMessage, WhatsApp, and
   * search: a 1200×630 PNG or JPG in `public/`, like `/og-image.jpg`. Pages
   * can set their own. Empty shows previews without an image.
   */
  image: string;
  imageAlt: string;
  /** The `content` of Google Search Console's HTML tag, if it's used. */
  googleSiteVerification: string;
};

/** What search engines and link previews read about this site. */
export const site: Site = {
  name: 'My App',
  description: 'Built with Layerwise',
  url: '',
  image: '',
  imageAlt: '',
  googleSiteVerification: ''
};

/** Public pages in `/sitemap.xml`. Add every page search engines should find. */
export const sitemapPaths: string[] = ['/'];

const requestOrigin = createIsomorphicFn()
  .server(() => getRequestUrl().origin)
  .client(() => window.location.origin);

/** Absolute URL for a path or a `public/` file on this site. */
export function siteUrl(path = '/'): string {
  return new URL(path, site.url || requestOrigin()).toString();
}
