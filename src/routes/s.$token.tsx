import { useEffect, useMemo, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRightIcon, DownloadIcon, FolderOpenIcon, LinkIcon, LockIcon } from 'lucide-react';
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
import { Logo } from '~/components/logo';
import { FileIcon } from '~/components/files/file-icon';
import { FilePreview, type PreviewSource } from '~/components/files/preview';
import { errorMessage, startDownload } from '~/components/files/queries';
import { formatBytes, formatDate, type Item } from '~/lib/files';
import {
  getSharedFileText,
  getSharedFileUrl,
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
          <p className='mt-1 px-1.5 text-sm text-muted-foreground'>
            {items.length} {items.length === 1 ? 'item' : 'items'} · View only
            {!data.allowDownload && ' · Downloads are turned off'}
          </p>
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
        ) : (
          <ul className='divide-y rounded-xl border bg-card'>
            {items.map((item) => (
              <SharedRow
                key={item.id}
                item={item}
                canDownload={data.allowDownload}
                onOpen={() =>
                  item.type === 'folder'
                    ? openFolder(item.id)
                    : setPreviewIndex(files.findIndex((f) => f.id === item.id))
                }
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

function SharedRow({
  item,
  canDownload,
  onOpen,
  onDownload
}: {
  item: Omit<Item, 'location' | 'shared'>;
  canDownload: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  return (
    <li className='flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 sm:px-4'>
      <button type='button' onClick={onOpen} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
        <FileIcon item={item} className='size-6' />
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
