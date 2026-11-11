import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { errorMessage, useRefreshFiles } from '~/components/files/queries';
import { createFolder, createTextFile } from '~/server/files.functions';

export type CreateRequest = { kind: 'folder' | 'text'; parentId: string | null };

export function CreateDialog({
  request,
  onOpenChange
}: {
  request: CreateRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefreshFiles();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (request) {
      setName(request.kind === 'folder' ? '' : 'Untitled.txt');
      setContent('');
    }
  }, [request]);

  const create = useMutation({
    mutationFn: async () => {
      if (!request) return;
      return request.kind === 'folder'
        ? createFolder({ data: { parentId: request.parentId, name } })
        : createTextFile({ data: { parentId: request.parentId, name, content } });
    },
    onSuccess: (item) => {
      refresh();
      if (item) toast.success(`Created “${item.name}”`);
      onOpenChange(false);
    }
  });

  const isFolder = request?.kind === 'folder';
  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className={isFolder ? 'sm:max-w-sm' : 'sm:max-w-2xl'}>
        <form
          className='flex flex-col gap-4'
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isFolder ? 'New folder' : 'New text file'}</DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='create-name'>Name</Label>
            <Input
              id='create-name'
              autoFocus
              value={name}
              placeholder={isFolder ? 'Folder name' : 'notes.md'}
              onChange={(e) => {
                setName(e.target.value);
                create.reset();
              }}
              onFocus={(e) => {
                // Select the name without its extension.
                const dot = e.currentTarget.value.lastIndexOf('.');
                if (dot > 0) e.currentTarget.setSelectionRange(0, dot);
              }}
            />
          </div>
          {!isFolder && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='create-content'>Text</Label>
              <Textarea
                id='create-content'
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className='min-h-64 font-mono text-sm'
                placeholder='Start typing…'
              />
            </div>
          )}
          {create.error && <p className='text-sm text-destructive'>{errorMessage(create.error)}</p>}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={!name.trim() || create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
