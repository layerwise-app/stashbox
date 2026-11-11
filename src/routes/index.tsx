import { useEffect } from 'react';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  EyeIcon,
  FolderIcon,
  ImageIcon,
  Link2Icon,
  StarIcon,
  UploadCloudIcon
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Logo } from '~/components/logo';
import { FileIcon } from '~/components/files/file-icon';
import { getAuthSession } from '~/lib/auth.functions';
import { site, siteUrl } from '~/lib/site';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { account?: 'deleted' } =>
    search.account === 'deleted' ? { account: 'deleted' } : {},
  beforeLoad: async () => {
    if (await getAuthSession()) throw redirect({ to: '/dashboard' });
  },
  head: () =>
    seo({
      title: 'Stashbox — Store, preview, and share your files',
      description: site.description,
      path: '/',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: site.name,
        url: siteUrl('/'),
        applicationCategory: 'ProductivityApplication',
        description: site.description
      }
    }),
  component: Home
});

const FEATURES = [
  {
    icon: UploadCloudIcon,
    title: 'Upload anything',
    body: 'Drag in files or whole folders. Big videos go straight to storage, and your folder structure comes along.'
  },
  {
    icon: EyeIcon,
    title: 'Preview in the browser',
    body: 'Open photos, PDFs, video, audio, and text right where they live, then arrow through the rest of the folder.'
  },
  {
    icon: Link2Icon,
    title: 'Share with a link',
    body: 'Send a link to any file or folder. Add a password or an expiry date, and turn it off whenever you like.'
  }
];

function Home() {
  const { account } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (account !== 'deleted') return;
    toast.success('Your account and all of its files were deleted.', { id: 'account-deleted' });
    navigate({ to: '/', search: {}, replace: true });
  }, [account, navigate]);

  return (
    <div className='flex min-h-[100dvh] flex-col bg-background'>
      <header className='w-full'>
        <div className='mx-auto flex h-16 max-w-6xl items-center gap-2 px-6'>
          <Link to='/' className='mr-auto flex items-center gap-2 text-lg font-semibold tracking-tight'>
            <Logo className='size-8' />
            Stashbox
          </Link>
          <Button variant='ghost' asChild>
            <Link to='/sign-in'>Sign in</Link>
          </Button>
          <Button asChild>
            <Link to='/sign-up'>Sign up</Link>
          </Button>
        </div>
      </header>

      <main className='flex-1'>
        <section className='mx-auto grid max-w-6xl items-center gap-12 px-6 pt-12 pb-20 lg:grid-cols-[1.05fr_1fr] lg:pt-20'>
          <div className='flex flex-col items-start gap-6'>
            <p className='rounded-full border bg-muted/50 px-3 py-1 text-sm text-muted-foreground'>
              2 GB free · No credit card
            </p>
            <h1 className='text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl'>
              All your files, one tidy place.
            </h1>
            <p className='max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl'>
              Stashbox keeps your files safe in the cloud. Upload from anywhere, find
              anything in seconds, and share with a link when you’re ready.
            </p>
            <div className='flex flex-wrap gap-3'>
              <Button size='lg' asChild className='h-11 px-6 text-base'>
                <Link to='/sign-up'>Get started free</Link>
              </Button>
              <Button size='lg' variant='outline' asChild className='h-11 px-6 text-base'>
                <Link to='/sign-in'>Sign in</Link>
              </Button>
            </div>
          </div>
          <HeroMock />
        </section>

        <section className='border-t bg-muted/30'>
          <div className='mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3'>
            {FEATURES.map((feature) => (
              <div key={feature.title} className='rounded-2xl border bg-card p-6'>
                <div className='mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary'>
                  <feature.icon className='size-5' />
                </div>
                <h2 className='mb-2 text-lg font-semibold'>{feature.title}</h2>
                <p className='text-muted-foreground'>{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className='border-t'>
        <div className='mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground'>
          <span className='flex items-center gap-2'>
            <Logo className='size-5' /> Stashbox
          </span>
          <span>Your files stay private until you share them.</span>
          <a
            href='https://layerwise.app'
            target='_blank'
            rel='noopener noreferrer'
            className='flex-none'
          >
            <img
              src='https://layerwise.app/powered-by.png'
              alt='Powered by Layerwise'
              width={174}
              height={28}
              loading='lazy'
              className='block h-7 w-[174px]'
            />
          </a>
        </div>
      </footer>
    </div>
  );
}

/** A small, static picture of the file browser. */
function HeroMock() {
  const rows = [
    { type: 'folder' as const, name: 'Trip to Lisbon', meta: '24 items', starred: true },
    { type: 'folder' as const, name: 'Taxes 2026', meta: '8 items' },
    { type: 'file' as const, name: 'Floor plan.pdf', meta: '2.4 MB', mimeType: 'application/pdf' },
    { type: 'file' as const, name: 'Launch video.mp4', meta: '86 MB', mimeType: 'video/mp4', shared: true },
    { type: 'file' as const, name: 'Notes.md', meta: '4 KB', mimeType: 'text/markdown' }
  ];
  return (
    <div className='relative' aria-hidden>
      <div className='absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/20 via-sky-300/10 to-transparent blur-2xl' />
      <div className='overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10'>
        <div className='flex items-center gap-2 border-b px-4 py-3'>
          <span className='size-3 rounded-full bg-red-400/80' />
          <span className='size-3 rounded-full bg-amber-400/80' />
          <span className='size-3 rounded-full bg-emerald-400/80' />
          <span className='ml-3 flex items-center gap-1.5 text-sm text-muted-foreground'>
            <FolderIcon className='size-4' /> All files
          </span>
        </div>
        <div className='grid grid-cols-[1fr_auto] gap-x-4'>
          {rows.map((row, i) => (
            <div key={row.name} className={`col-span-2 grid grid-cols-subgrid items-center px-4 py-3 text-sm ${i === 2 ? 'bg-primary/10' : ''}`}>
              <span className='flex items-center gap-3'>
                <FileIcon item={row} className='size-5' />
                {row.name}
                {row.starred && <StarIcon className='size-3.5 fill-amber-400 text-amber-400' />}
                {row.shared && <Link2Icon className='size-3.5 text-muted-foreground' />}
              </span>
              <span className='text-muted-foreground'>{row.meta}</span>
            </div>
          ))}
        </div>
        <div className='m-4 flex items-center gap-3 rounded-xl border bg-background p-3 shadow-sm'>
          <ImageIcon className='size-5 text-violet-500' />
          <div className='flex-1'>
            <p className='text-sm'>Sunset at Belém.jpg</p>
            <div className='mt-1.5 h-1 rounded-full bg-muted'>
              <div className='h-1 w-2/3 rounded-full bg-primary' />
            </div>
          </div>
          <span className='text-xs text-muted-foreground'>68%</span>
        </div>
      </div>
    </div>
  );
}
