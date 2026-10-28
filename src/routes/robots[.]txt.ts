import { createFileRoute } from '@tanstack/react-router';
import { siteUrl } from '~/lib/site';

// Signed-in pages and the API stay out of search. Public pages that shouldn't
// show in results, like sign-in, use `seo({ noindex: true })` instead.
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          [
            'User-agent: *',
            'Disallow: /api/',
            'Disallow: /dashboard',
            '',
            `Sitemap: ${siteUrl('/sitemap.xml')}`,
            ''
          ].join('\n'),
          { headers: { 'content-type': 'text/plain; charset=utf-8' } }
        )
    }
  }
});
