import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EllipsisIcon, InfoIcon, RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
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
import { FileIcon } from '~/components/files/file-icon';
import { PageTitle } from '~/components/files/folder-view';
import { errorMessage, fileKeys, useRefreshFiles } from '~/components/files/queries';
import { formatBytes, formatDate } from '~/lib/files';
import { cn } from '~/lib/utils';
import { deleteForever, emptyTrash, listTrash, restoreItems } from '~/server/files.functions';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/dashboard/trash')({
  head: () => seo({ title: 'Trash · Stashbox', noindex: true }),
  component: TrashPage
});

type Confirm = { kind: 'empty' } | { kind: 'delete'; ids: string[]; label: string };

function TrashPage() {
  const refresh = useRefreshFiles();
  const query = useQuery({ queryKey: fileKeys.trash, queryFn: () => listTrash() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const items = query.data ?? [];
  const nameOf = (ids: string[]) =>
    ids.length === 1 ? `“${items.find((i) => i.id === ids[0])?.name}”` : `${ids.length} items`;

  const restore = useMutation({
    mutationFn: (ids: string[]) => restoreItems({ data: { ids } }),
    onSuccess: async (restored) => {
      setSelected(new Set());
      await refresh();
      toast.success(
        restored.length === 1 ? `Restored “${restored[0].name}”` : `Restored ${restored.length} items`
      );
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const remove = useMutation({
    mutationFn: async (c: Confirm) =>
      c.kind === 'empty' ? emptyTrash() : deleteForever({ data: { ids: c.ids } }),
    onSuccess: async (_, c) => {
      setSelected(new Set());
      setConfirm(null);
      await refresh();
      toast.success(c.kind === 'empty' ? 'Trash emptied' : `Deleted ${c.label} forever`);
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const selectedIds = [...selected];
  const totalSize = items.reduce((sum, i) => sum + i.size, 0);

  return (
    <div className='flex flex-1 flex-col'>
      <div className='px-4 pt-5 pb-1 sm:px-8 sm:pt-7'>
        <PageTitle>Trash</PageTitle>
      </div>
      <div className='sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 bg-background px-4 py-2.5 sm:px-8'>
        {selected.size > 0 ? (
          <>
            <Button size='sm' onClick={() => restore.mutate(selectedIds)} disabled={restore.isPending}>
              <RotateCcwIcon /> Restore
            </Button>
            <Button
              variant='outline'
              size='sm'
              className='text-destructive hover:text-destructive'
              onClick={() => setConfirm({ kind: 'delete', ids: selectedIds, label: nameOf(selectedIds) })}
            >
              <Trash2Icon /> Delete forever
            </Button>
            <span className='ml-auto text-sm text-muted-foreground'>{selected.size} selected</span>
            <Button variant='ghost' size='icon-sm' onClick={() => setSelected(new Set())} aria-label='Clear selection'>
              <XIcon />
            </Button>
          </>
        ) : (
          <>
            <p className='flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground'>
              <InfoIcon className='size-4 shrink-0' />
              <span>
                Items in Trash still count toward your storage
                {totalSize > 0 && <> (<strong className='font-semibold text-foreground'>{formatBytes(totalSize)}</strong> here)</>}. Delete them forever to free up space.
              </span>
            </p>
            <Button variant='outline' size='sm' disabled={!items.length} onClick={() => setConfirm({ kind: 'empty' })}>
              <Trash2Icon /> Empty trash
            </Button>
          </>
        )}
      </div>

      {query.error ? (
        <p className='px-4 py-6 text-sm text-destructive sm:px-8'>{errorMessage(query.error)}</p>
      ) : query.isLoading ? (
        <div className='space-y-3 px-4 sm:px-8'>
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className='h-10 max-w-xl' />)}
        </div>
      ) : items.length === 0 ? (
        <div className='flex flex-1 items-start justify-center px-4 pt-10 sm:px-8'>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Trash2Icon />
              </EmptyMedia>
              <EmptyTitle>Trash is empty</EmptyTitle>
              <EmptyDescription>Deleted files and folders wait here until you delete them forever.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        // On narrow screens the table keeps its columns and scrolls sideways.
        <div className='px-4 pb-24 sm:px-8'>
          <Table aria-label='Trash' className='min-w-[58rem] table-fixed'>
            <colgroup>
              <col className='w-10' />
              <col />
              <col className='w-56' />
              <col className='w-40' />
              <col className='w-24' />
              <col className='w-36' />
            </colgroup>
            <TableHeader>
              <TableRow className='hover:bg-transparent'>
                <TableHead>
                  <Checkbox
                    aria-label='Select all'
                    checked={selected.size === items.length ? true : selected.size ? 'indeterminate' : false}
                    onCheckedChange={() =>
                      setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))
                    }
                  />
                </TableHead>
                <TableHead className='text-xs text-muted-foreground'>Name</TableHead>
                <TableHead className='text-xs text-muted-foreground'>Original location</TableHead>
                <TableHead className='text-xs text-muted-foreground'>Deleted</TableHead>
                <TableHead className='text-right text-xs text-muted-foreground'>Size</TableHead>
                <TableHead><span className='sr-only'>Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                return (
                  <TableRow
                    key={item.id}
                    aria-selected={isSelected}
                    className={cn('group h-14', isSelected ? 'bg-selection hover:bg-selection' : 'hover:bg-muted')}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${item.name}`}
                        checked={isSelected}
                        onCheckedChange={() =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className='flex min-w-0 items-center gap-3'>
                        <FileIcon item={item} className='size-9 opacity-60' />
                        <span className='truncate font-medium text-muted-foreground'>{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className='truncate text-muted-foreground' title={item.originalPath}>
                      {item.originalPath}
                    </TableCell>
                    <TableCell className='text-muted-foreground'>{formatDate(item.trashedAt)}</TableCell>
                    <TableCell className='text-right text-muted-foreground tabular-nums'>{formatBytes(item.size)}</TableCell>
                    <TableCell>
                      <div className='flex items-center justify-end gap-1'>
                        <Button
                          variant='outline'
                          size='sm'
                          className='opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-aria-selected:opacity-100 pointer-coarse:opacity-100'
                          onClick={() => restore.mutate([item.id])}
                        >
                          Restore
                        </Button>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant='ghost' size='icon-sm' aria-label={`Actions for ${item.name}`} className='text-muted-foreground'>
                              <EllipsisIcon />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end' className='w-44'>
                            <DropdownMenuItem onSelect={() => restore.mutate([item.id])}>
                              <RotateCcwIcon /> Restore
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant='destructive'
                              onSelect={() => setConfirm({ kind: 'delete', ids: [item.id], label: `“${item.name}”` })}
                            >
                              <Trash2Icon /> Delete forever
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'empty' ? 'Empty trash?' : `Delete ${confirm?.label} forever?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'empty'
                ? `All ${items.length} items in Trash will be permanently deleted.`
                : 'This can’t be undone.'}{' '}
              Share links to these items stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-white hover:bg-destructive/90'
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) remove.mutate(confirm);
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
