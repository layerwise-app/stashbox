import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon, FolderPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { FileIcon } from '~/components/files/file-icon';
import { errorMessage, fileKeys } from '~/components/files/queries';
import { createFolder, listFolders } from '~/server/files.functions';
import { cn } from '~/lib/utils';

export type PickerRequest = {
  mode: 'move' | 'copy';
  items: { id: string; name: string; type: 'file' | 'folder'; parentId: string | null }[];
  startFolderId: string | null;
};

export function FolderPickerDialog({
  request,
  onOpenChange,
  onPick
}: {
  request: PickerRequest | null;
  onOpenChange: (open: boolean) => void;
  onPick: (targetId: string | null) => Promise<unknown>;
}) {
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (request) {
      setFolderId(request.startFolderId);
      setCreating(false);
    }
  }, [request]);

  const folders = useQuery({
    queryKey: fileKeys.folders(folderId),
    queryFn: () => listFolders({ data: { folderId } }),
    enabled: !!request
  });

  const create = useMutation({
    mutationFn: () => createFolder({ data: { parentId: folderId, name: newName } }),
    onSuccess: (folder) => {
      setCreating(false);
      setNewName('');
      queryClient.invalidateQueries({ queryKey: fileKeys.all });
      setFolderId(folder.id);
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const pick = useMutation({ mutationFn: () => onPick(folderId) });

  if (!request) return null;
  const movingIds = new Set(request.items.map((i) => i.id));
  const verb = request.mode === 'move' ? 'Move' : 'Copy';
  const what = request.items.length === 1 ? `“${request.items[0].name}”` : `${request.items.length} items`;
  // Moving into the folder the items are already in does nothing.
  const sameFolder =
    request.mode === 'move' && request.items.every((i) => i.parentId === folderId);
  const crumbs = folders.data?.crumbs ?? [];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {verb} {what}
          </DialogTitle>
          <DialogDescription>Choose a destination folder.</DialogDescription>
        </DialogHeader>

        <nav aria-label='Destination path' className='flex flex-wrap items-center gap-1 text-sm'>
          {crumbs.map((crumb, i) => (
            <span key={crumb.id ?? 'root'} className='flex items-center gap-1'>
              {i > 0 && <ChevronRightIcon className='size-3.5 text-muted-foreground' />}
              <button
                type='button'
                className={cn(
                  'rounded px-1 py-0.5 hover:bg-muted',
                  i === crumbs.length - 1 && 'font-medium'
                )}
                onClick={() => setFolderId(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <div className='h-64 overflow-y-auto rounded-lg border'>
          {folders.isLoading ? (
            <div className='flex h-full items-center justify-center'>
              <Spinner />
            </div>
          ) : folders.error ? (
            <p className='p-4 text-sm text-destructive'>{errorMessage(folders.error)}</p>
          ) : (
            <ul className='p-1'>
              {creating && (
                <li>
                  <form
                    className='flex items-center gap-2 p-1'
                    onSubmit={(e) => {
                      e.preventDefault();
                      create.mutate();
                    }}
                  >
                    <FileIcon item={{ type: 'folder', name: '' }} className='size-5' />
                    <Input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder='Folder name'
                      className='h-8'
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setCreating(false);
                        }
                      }}
                    />
                    <Button type='submit' size='sm' disabled={!newName.trim() || create.isPending}>
                      Create
                    </Button>
                  </form>
                </li>
              )}
              {folders.data?.folders.map((folder) => {
                const disabled = request.mode === 'move' && movingIds.has(folder.id);
                return (
                  <li key={folder.id}>
                    <button
                      type='button'
                      disabled={disabled}
                      onClick={() => setFolderId(folder.id)}
                      className='flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent'
                    >
                      <FileIcon item={{ type: 'folder', name: folder.name }} className='size-5' />
                      <span className='flex-1 truncate'>{folder.name}</span>
                      <ChevronRightIcon className='size-4 text-muted-foreground' />
                    </button>
                  </li>
                );
              })}
              {!creating && folders.data?.folders.length === 0 && (
                <li className='p-6 text-center text-sm text-muted-foreground'>No folders here.</li>
              )}
            </ul>
          )}
        </div>

        {pick.error && <p className='text-sm text-destructive'>{errorMessage(pick.error)}</p>}

        <DialogFooter className='sm:justify-between'>
          <Button variant='ghost' onClick={() => setCreating(true)} disabled={creating}>
            <FolderPlusIcon />
            New folder
          </Button>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={sameFolder || pick.isPending || !folders.data} onClick={() => pick.mutate()}>
              {verb} here
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
