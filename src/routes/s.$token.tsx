import { useEffect, useMemo, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronRightIcon,
  DownloadIcon,
  EyeIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  PlayIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { Logo } from '~/components/logo';
import { FileIcon } from '~/components/files/file-icon';
import { FilePreview, type PreviewSource } from '~/components/files/preview';
import { errorMessage, startDownload, usePersistentState } from '~/components/files/queries';
import { fileKind, formatBytes, formatDate, type Item } from '~/lib/files';
import {
  getSharedFileText,
  getSharedFileUrl,
  getSharedThumbUrls,
  openShare,
  unlockShare
} from '~/server/share.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/s/$token')({
  validateSearch: (search: Record<string, unknown>): { folder?: string } =>
    typeof search.folder === 'string' && search.folder ? { folder: search.folder } : {},
  head: () => seo({ title: 'Shared with you · Stashbox', noindex: true }),
  component: SharedPage
});

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function SharedPage() {
  const { token } = Route.useParams();
  const { folder } = Route.useSearch();
  const navigate = useNavigate();
  const grantKey = `stashbox:grant:${token}`;
  const [ready, setReady] = useState(false);
  const [grant, setGrant] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [view, setView] = usePersistentState<'list' | 'grid'>('stashbox:share-view', 'list');

  useEffect(() => {
    setGrant(sessionStorage.getItem(grantKey));
    setReady(true);
  }, [grantKey]);

  const share = useQuery({
    queryKey: ['share', token, folder ?? 'root', grant],
    enabled: ready,
    queryFn: async () => {
      // Count one view per visit to the link, not per folder opened.
      const viewedKey = `stashbox:viewed:${token}`;
      const countView = !sessionStorage.getItem(viewedKey);
      const result = await openShare({ data: { token, grant, folderId: folder ?? null, countView } });
      if (result.status === 'ok' && countView) sessionStorage.setItem(viewedKey, '1');
      return result;
    }
  });

  const data = share.data?.status === 'ok' ? share.data : null;
  const items = useMemo(
    () =>
      [...(data?.items ?? [])].sort((a, b) =>
        a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : collator.compare(a.name, b.name)
      ),
    [data]
  );
  const files = useMemo(() => items.filter((i) => i.type === 'file'), [items]);

  // Thumbnails, like the owner's browser: images in both views, video
  // frames in grid view. The server checks each file against the link.
  const mediaIds = useMemo(
    () =>
      files
        .filter((f) => {
          const kind = fileKind(f.name, f.mimeType);
          return kind === 'image' || (view === 'grid' && kind === 'video');
        })
        .map((f) => f.id)
        .slice(0, 200),
    [files, view]
  );
  const thumbs = useQuery({
    queryKey: ['share-thumbs', token, grant, folder ?? 'root', mediaIds.join(',')],
    queryFn: () =>
      getSharedThumbUrls({ data: { token, grant, folderId: folder ?? null, ids: mediaIds } }),
    enabled: !!data && data.root.type === 'folder' && mediaIds.length > 0,
    staleTime: 10 * 60 * 1000
  });

  const source = useMemo<PreviewSource>(
    () => ({
      key: `share:${token}`,
      url: (file) => getSharedFileUrl({ data: { token, grant, fileId: file.id } }),
      text: (file) => getSharedFileText({ data: { token, grant, fileId: file.id } }),
      download: data?.allowDownload
        ? (file) =>
            getSharedFileUrl({ data: { token, grant, fileId: file.id, download: true } })
              .then(startDownload)
              .catch((error) => toast.error(errorMessage(error)))
        : undefined
    }),
    [token, grant, data?.allowDownload]
  );

  if (!ready || share.isLoading) return <PageFrame><LoadingList /></PageFrame>;
  if (share.error)
    return <Message title='Something went wrong' body={errorMessage(share.error)} />;
  if (share.data?.status === 'missing')
    return <Message title='This link doesn’t work' body='It may have been turned off, or the item was deleted. Ask the person who shared it for a new link.' />;
  if (share.data?.status === 'expired')
    return <Message title='This link has expired' body='Ask the person who shared it for a new link.' />;
  if (share.data?.status === 'password')
    return (
      <PasswordForm
        token={token}
        onUnlock={(value) => {
          sessionStorage.setItem(grantKey, value);
          setGrant(value);
        }}
      />
    );
  if (!data) return null;

  // A shared file opens straight in the preview.
  if (data.root.type === 'file')
    return (
      <FilePreview
        files={[data.root]}
        index={0}
        onIndexChange={() => {}}
        source={source}
      />
    );

  const openFolder = (id: string) =>
    navigate({ to: '/s/$token', params: { token }, search: id === data.root.id ? {} : { folder: id } });

  const openItem = (item: SharedItem) =>
    item.type === 'folder'
      ? openFolder(item.id)
      : setPreviewIndex(files.findIndex((f) => f.id === item.id));

  return (
    <PageFrame owner={data.ownerName}>
      <div className='mx-auto w-full max-w-5xl px-4 py-6 sm:px-6'>
        <nav aria-label='Folder path' className='mb-4'>
          <ol className='flex flex-wrap items-center gap-0.5'>
            {data.crumbs.map((crumb, i) => {
              const last = i === data.crumbs.length - 1;
              return (
                <li key={crumb.id} className='flex items-center gap-0.5'>
                  {i > 0 && <ChevronRightIcon className='size-4 text-muted-foreground' />}
                  {last ? (
                    <h1 className='px-1.5 text-xl font-semibold'>{crumb.name}</h1>
                  ) : (
                    <button
                      type='button'
                      className='rounded px-1.5 py-0.5 text-xl text-muted-foreground hover:bg-muted hover:text-foreground'
                      onClick={() => openFolder(crumb.id!)}
                    >
                      {crumb.name}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 px-1.5'>
            <p className='flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground'>
              {data.allowDownload ? (
                <DownloadIcon className='size-3.5 shrink-0' />
              ) : (
                <EyeIcon className='size-3.5 shrink-0' />
              )}
              <span>
                {items.length} {items.length === 1 ? 'item' : 'items'} ·{' '}
                {data.allowDownload
                  ? 'Anyone with the link can view and download'
                  : 'View only. Downloads are turned off'}
              </span>
            </p>
            {items.length > 0 && (
              <ToggleGroup
                type='single'
                size='sm'
                value={view}
                onValueChange={(value) => value && setView(value as 'list' | 'grid')}
                aria-label='View'
                className='rounded-md border p-0.5'
              >
                <ToggleGroupItem value='list' aria-label='List view' className='h-7 rounded-[5px] px-2 data-[state=on]:bg-accent'>
                  <ListIcon />
                </ToggleGroupItem>
                <ToggleGroupItem value='grid' aria-label='Grid view' className='h-7 rounded-[5px] px-2 data-[state=on]:bg-accent'>
                  <LayoutGridIcon />
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </nav>

        {items.length === 0 ? (
          <Empty className='border'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FolderOpenIcon />
              </EmptyMedia>
              <EmptyTitle>This folder is empty</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : view === 'list' ? (
          <ul className='divide-y rounded-xl border bg-card'>
            {items.map((item) => (
              <SharedRow
                key={item.id}
                item={item}
                thumb={thumbs.data?.[item.id]}
                canDownload={data.allowDownload}
                onOpen={() => openItem(item)}
                onDownload={() => source.download?.(item)}
              />
            ))}
          </ul>
        ) : (
          <ul className='grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2'>
            {items.map((item) => (
              <SharedTile
                key={item.id}
                item={item}
                thumb={thumbs.data?.[item.id]}
                canDownload={data.allowDownload}
                onOpen={() => openItem(item)}
                onDownload={() => source.download?.(item)}
              />
            ))}
          </ul>
        )}
      </div>
      {previewIndex !== null && files[previewIndex] && (
        <FilePreview
          files={files}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          source={source}
        />
      )}
    </PageFrame>
  );
}

type SharedItem = Omit<Item, 'location' | 'shared' | 'sharedVia'>;

function SharedRow({
  item,
  thumb,
  canDownload,
  onOpen,
  onDownload
}: {
  item: SharedItem;
  thumb?: string;
  canDownload: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  return (
    <li className='flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 sm:px-4'>
      <button type='button' onClick={onOpen} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
        {thumb ? (
          <img src={thumb} alt='' loading='lazy' draggable={false} className='size-9 shrink-0 rounded-md border bg-muted object-cover' />
        ) : (
          <FileIcon item={item} className='size-9' />
        )}
        <span className='min-w-0'>
          <span className='block truncate text-sm font-medium hover:underline'>{item.name}</span>
          <span className='block truncate text-xs text-muted-foreground'>
            {item.type === 'folder' ? 'Folder' : formatBytes(item.size)} · {formatDate(item.updatedAt)}
          </span>
        </span>
      </button>
      {item.type === 'file' && canDownload && (
        <Button variant='ghost' size='sm' onClick={onDownload} aria-label={`Download ${item.name}`}>
          <DownloadIcon />
          <span className='max-sm:sr-only'>Download</span>
        </Button>
      )}
    </li>
  );
}

function SharedTile({
  item,
  thumb,
  canDownload,
  onOpen,
  onDownload
}: {
  item: SharedItem;
  thumb?: string;
  canDownload: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const kind = item.type === 'file' ? fileKind(item.name, item.mimeType) : null;
  return (
    <li className='group relative flex flex-col rounded-lg p-2 hover:bg-muted'>
      <button type='button' onClick={onOpen} className='flex flex-col text-left' aria-label={`Open ${item.name}`}>
        <span className='relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted/70'>
          {thumb && kind === 'image' ? (
            <img src={thumb} alt='' loading='lazy' draggable={false} className='size-full object-cover' />
          ) : thumb && kind === 'video' ? (
            <>
              {/* The icon shows until (or if) the first frame loads. */}
              <FileIcon item={item} className='absolute size-16' />
              <video src={`${thumb}#t=0.5`} preload='metadata' muted playsInline className='pointer-events-none relative size-full object-cover' />
              <span className='absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white'>
                <PlayIcon className='size-3.5 fill-current' />
              </span>
            </>
          ) : (
            <FileIcon item={item} className='size-16' />
          )}
        </span>
      </button>
      <div className='flex items-start gap-1 pt-2'>
        <div className='min-w-0 flex-1 px-0.5'>
          <p className='line-clamp-2 text-sm leading-snug font-medium [overflow-wrap:anywhere]' title={item.name}>
            {item.name}
          </p>
          <p className='truncate text-xs text-muted-foreground'>
            {item.type === 'folder' ? 'Folder' : formatBytes(item.size)}
          </p>
        </div>
        {item.type === 'file' && canDownload && (
          <Button variant='ghost' size='icon-sm' onClick={onDownload} aria-label={`Download ${item.name}`} className='text-muted-foreground'>
            <DownloadIcon />
          </Button>
        )}
      </div>
    </li>
  );
}

function PageFrame({ owner, children }: { owner?: string; children: React.ReactNode }) {
  return (
    <div className='flex min-h-svh flex-col bg-background'>
      <header className='border-b'>
        <div className='mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4 sm:px-6'>
          <Link to='/' className='flex items-center gap-2 font-semibold'>
            <Logo className='size-7' />
            Stashbox
          </Link>
          {owner && (
            <p className='ml-auto flex items-center gap-1.5 truncate text-sm text-muted-foreground'>
              <LinkIcon className='size-3.5' /> Shared by {owner}
            </p>
          )}
        </div>
      </header>
      <main className='flex flex-1 flex-col'>{children}</main>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <PageFrame>
      <div className='flex flex-1 items-center justify-center p-6'>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <LinkIcon />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{body}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </PageFrame>
  );
}

function PasswordForm({ token, onUnlock }: { token: string; onUnlock: (grant: string) => void }) {
  const [password, setPassword] = useState('');
  const unlock = useMutation({
    mutationFn: () => unlockShare({ data: { token, password } }),
    onSuccess: ({ grant }) => onUnlock(grant)
  });
  return (
    <PageFrame>
      <div className='flex flex-1 items-center justify-center p-4'>
        <Card className='w-full max-w-sm'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <LockIcon className='size-5' /> Password required
            </CardTitle>
            <CardDescription>Enter the password you were given to open this link.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className='flex flex-col gap-4'
              onSubmit={(e) => {
                e.preventDefault();
                unlock.mutate();
              }}
            >
              <div className='flex flex-col gap-2'>
                <Label htmlFor='share-password'>Password</Label>
                <Input
                  id='share-password'
                  type='password'
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    unlock.reset();
                  }}
                />
              </div>
              {unlock.error && <p className='text-sm text-destructive'>{errorMessage(unlock.error)}</p>}
              <Button type='submit' disabled={unlock.isPending || !password}>
                {unlock.isPending ? 'Checking…' : 'Open'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}

function LoadingList() {
  return (
    <div className='mx-auto w-full max-w-5xl space-y-3 px-4 py-6 sm:px-6'>
      <Skeleton className='h-7 w-48' />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className='h-10' />
      ))}
    </div>
  );
}
