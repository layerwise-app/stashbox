import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CopyIcon, DownloadIcon, EyeIcon, LinkIcon, LockIcon, Settings2Icon, Unlink2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '~/components/ui/empty';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { useFileActions } from '~/components/files/actions';
import { FileIcon } from '~/components/files/file-icon';
import { PageTitle } from '~/components/files/folder-view';
import { errorMessage, fileKeys, useRefreshFiles } from '~/components/files/queries';
import { copyText, shareUrl } from '~/components/files/share-dialog';
import { formatDate } from '~/lib/files';
import { deleteShare, listShares } from '~/server/share.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/shared')({
  head: () => seo({ title: 'Shared links · Stashbox', noindex: true }),
  component: SharedLinksPage
});

function IconAction({
  label,
  tip,
  onClick,
  disabled,
  destructive,
  children
}: {
  label: string;
  tip: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={destructive ? 'text-destructive hover:text-destructive' : 'text-muted-foreground'}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function SharedLinksPage() {
  const actions = useFileActions();
  const refresh = useRefreshFiles();
  const query = useQuery({ queryKey: fileKeys.shares, queryFn: () => listShares() });
  const revoke = useMutation({
    mutationFn: (itemId: string) => deleteShare({ data: { itemId } }),
    onSuccess: async () => {
      await refresh();
      toast.success('Link revoked. It no longer works.');
    },
    onError: (error) => toast.error(errorMessage(error))
  });
  const links = query.data ?? [];
  const now = Date.now();

  return (
    <div className='flex flex-1 flex-col'>
      <div className='px-4 pt-5 pb-1 sm:px-8 sm:pt-7'>
        <PageTitle>Shared links</PageTitle>
      </div>
      <p className='flex min-h-14 items-center px-4 text-sm text-muted-foreground sm:px-8'>
        Anyone with one of these links can open the item, no account needed.
      </p>
      {query.error ? (
        <p className='px-4 py-6 text-sm text-destructive sm:px-8'>{errorMessage(query.error)}</p>
      ) : query.isLoading ? (
        <div className='space-y-3 px-4 sm:px-8'>
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className='h-10 max-w-xl' />)}
        </div>
      ) : links.length === 0 ? (
        <div className='flex flex-1 items-start justify-center px-4 pt-10 sm:px-8'>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <LinkIcon />
              </EmptyMedia>
              <EmptyTitle>No shared links</EmptyTitle>
              <EmptyDescription>
                Choose Share on any file or folder to create a link anyone can open.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        // On narrow screens the table keeps its columns and scrolls sideways.
        <div className='px-4 pb-24 sm:px-8'>
          <Table aria-label='Shared links' className='min-w-[60rem] table-fixed'>
            <colgroup>
              <col />
              <col className='w-36' />
              <col className='w-36' />
              <col className='w-24' />
              <col className='w-44' />
              <col className='w-32' />
            </colgroup>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead className='text-xs text-muted-foreground'>Item</TableHead>
                <TableHead className='text-xs text-muted-foreground'>Created</TableHead>
                <TableHead className='text-xs text-muted-foreground'>Expires</TableHead>
                <TableHead className='text-xs text-muted-foreground'>Views</TableHead>
                <TableHead className='text-xs text-muted-foreground'>Settings</TableHead>
                <TableHead><span className='sr-only'>Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => {
                const expired = !!link.expiresAt && new Date(link.expiresAt).getTime() < now;
                return (
                  <TableRow key={link.token} className='h-14 hover:bg-muted'>
                    <TableCell>
                      <div className='flex min-w-0 items-center gap-3'>
                        <FileIcon item={link} className='size-9' />
                        <span className='truncate font-medium'>{link.name}</span>
                        {link.inTrash && <Badge variant='outline'>In Trash</Badge>}
                        {expired && <Badge variant='secondary'>Expired</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{formatDate(link.createdAt)}</TableCell>
                    <TableCell className='text-muted-foreground'>
                      {link.expiresAt ? formatDate(link.expiresAt) : 'Never'}
                    </TableCell>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      <span className='inline-flex items-center gap-1.5'>
                        <EyeIcon className='size-3.5' /> {link.viewCount}
                      </span>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      <span className='inline-flex items-center gap-3 text-xs'>
                        <span className='inline-flex items-center gap-1'>
                          <LockIcon className='size-3.5' /> {link.hasPassword ? 'Password' : 'No password'}
                        </span>
                        <span className={`inline-flex items-center gap-1 ${link.allowDownload ? '' : 'line-through'}`}>
                          <DownloadIcon className='size-3.5' /> Download
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center justify-end gap-0.5'>
                        <IconAction
                          label={`Copy link to ${link.name}`}
                          tip='Copy link'
                          onClick={async () => {
                            if (await copyText(shareUrl(link.token))) toast.success('Link copied');
                            else toast.error('Couldn’t copy the link.');
                          }}
                        >
                          <CopyIcon />
                        </IconAction>
                        <IconAction
                          label={`Link settings for ${link.name}`}
                          tip='Link settings'
                          disabled={link.inTrash}
                          onClick={() => actions.share({ id: link.itemId, name: link.name, type: link.type, mimeType: link.mimeType })}
                        >
                          <Settings2Icon />
                        </IconAction>
                        <IconAction
                          label={`Revoke link to ${link.name}`}
                          tip='Revoke link'
                          destructive
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(link.itemId)}
                        >
                          <Unlink2Icon />
                        </IconAction>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
