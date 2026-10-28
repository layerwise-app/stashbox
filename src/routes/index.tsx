import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { site, siteUrl } from '~/lib/site';
import { seo } from '~/utils/seo';

const homePageTitle = 'Build full-stack web apps in minutes with Layerwise';

export const Route = createFileRoute('/')({
  head: () =>
    seo({
      title: homePageTitle,
      description: 'Get started by chatting with AI',
      path: '/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: site.name,
        url: siteUrl('/')
      }
    }),
  component: Home
});

function Home() {
  return (
    <div className='flex min-h-[100dvh] flex-col bg-background'>
      <header className='w-full'>
        <div className='container mx-auto flex h-16 items-center justify-end px-6 sm:px-8'>
          <Button variant='ghost' asChild>
            <Link to='/sign-in'>Sign in</Link>
          </Button>
        </div>
      </header>

      <main className='flex flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:px-8'>
        <div className='mx-auto flex max-w-4xl flex-col items-center gap-8'>
          <div className='space-y-4'>
            <h1 className='text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl'>
              {homePageTitle}
            </h1>
            <p className='text-balance text-lg text-muted-foreground sm:text-xl md:text-2xl'>
              Get started by chatting with AI
            </p>
          </div>

          <Button size='lg' asChild className='mt-4 rounded-full px-8'>
            <a
              href='https://layerwise.app'
              target='_blank'
              rel='noopener noreferrer'
            >
              Get Started
            </a>
          </Button>
        </div>
      </main>

      <footer className='w-full border-t'>
        <div className='container mx-auto px-6 py-8'>
          <div className='flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground sm:gap-8'>
            <Button
              variant='link'
              size='sm'
              asChild
              className='h-auto p-0 text-foreground'
            >
              <a
                href='https://layerwise.app'
                target='_blank'
                rel='noopener noreferrer'
              >
                Home
              </a>
            </Button>
            <Separator orientation='vertical' className='h-4' />
            <Button
              variant='link'
              size='sm'
              asChild
              className='h-auto p-0 text-foreground'
            >
              <a
                href='https://layerwise.app/docs'
                target='_blank'
                rel='noopener noreferrer'
              >
                Docs
              </a>
            </Button>
            <Separator orientation='vertical' className='h-4' />
            <Button
              variant='link'
              size='sm'
              asChild
              className='h-auto p-0 text-foreground'
            >
              <a
                href='https://layerwise.app/support'
                target='_blank'
                rel='noopener noreferrer'
              >
                Support
              </a>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
