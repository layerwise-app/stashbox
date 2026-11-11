import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, LockIcon } from 'lucide-react';
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
import { Label } from '~/components/ui/label';
import { Separator } from '~/components/ui/separator';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { FileIcon } from '~/components/files/file-icon';
import { errorMessage, fileKeys } from '~/components/files/queries';
import {
  deleteShare,
  getOrCreateShare,
  updateShare,
  type ShareInfo
} from '~/server/share.functions';

export type ShareTarget = { id: string; name: string; type: 'file' | 'folder'; mimeType: string | null };

export function shareUrl(token: string) {
  return `${window.location.origin}/s/${token}`;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function toDateInput(date: Date | null) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ShareDialog({
  target,
  onOpenChange
}: {
  target: ShareTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);

  const load = useMutation({
    mutationFn: (itemId: string) => getOrCreateShare({ data: { itemId } }),
    onSuccess: (info) => {
      setShare(info);
      queryClient.invalidateQueries({ queryKey: fileKeys.all });
    }
  });

  useEffect(() => {
    setShare(null);
    setCopied(false);
    setPassword('');
    setEditingPassword(false);
    if (target) load.mutate(target.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const save = useMutation({
    mutationFn: (patch: { expiresAt?: string | null; allowDownload?: boolean; password?: string | null }) =>
      updateShare({ data: { itemId: target!.id, ...patch } }),
    onSuccess: (info, patch) => {
      setShare(info);
      queryClient.invalidateQueries({ queryKey: fileKeys.shares });
      if (patch.password !== undefined) {
        setPassword('');
        setEditingPassword(false);
        toast.success(patch.password ? 'Password set' : 'Password removed');
      }
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const stop = useMutation({
    mutationFn: () => deleteShare({ data: { itemId: target!.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fileKeys.all });
      toast.success(`Stopped sharing “${target!.name}”`);
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const link = share ? shareUrl(share.token) : '';

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {target && <FileIcon item={target} className='size-5' />}
            <span className='truncate'>Share “{target?.name}”</span>
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can {target?.type === 'folder' ? 'browse this folder' : 'view this file'}, no account needed.
          </DialogDescription>
        </DialogHeader>

        {load.error ? (
          <p className='text-sm text-destructive'>{errorMessage(load.error)}</p>
        ) : !share ? (
          <div className='flex justify-center py-8'>
            <Spinner className='size-5' />
          </div>
        ) : (
          <div className='flex flex-col gap-5'>
            <div className='flex gap-2'>
              <Input readOnly value={link} aria-label='Share link' onFocus={(e) => e.currentTarget.select()} />
              <Button
                onClick={async () => {
                  if (await copyText(link)) {
                    setCopied(true);
                    toast.success('Link copied');
                    setTimeout(() => setCopied(false), 2000);
                  } else toast.error('Couldn’t copy. Select the link and copy it instead.');
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className='-mt-3 text-xs text-muted-foreground'>
              Viewed {share.viewCount} {share.viewCount === 1 ? 'time' : 'times'}
            </p>

            <Separator />

            <div className='flex items-center justify-between gap-4'>
              <div>
                <Label htmlFor='share-download'>Allow downloads</Label>
                <p className='text-xs text-muted-foreground'>Visitors can save copies of files.</p>
              </div>
              <Switch
                id='share-download'
                checked={share.allowDownload}
                disabled={save.isPending}
                onCheckedChange={(allowDownload) => save.mutate({ allowDownload })}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='share-expiry'>Expires</Label>
              <div className='flex gap-2'>
                <Input
                  id='share-expiry'
                  type='date'
                  min={toDateInput(new Date())}
                  value={toDateInput(share.expiresAt)}
                  onChange={(e) => {
                    const value = e.target.value;
                    // The link works through the end of the chosen day.
                    save.mutate({
                      expiresAt: value ? new Date(`${value}T23:59:59`).toISOString() : null
                    });
                  }}
                />
                {share.expiresAt && (
                  <Button variant='ghost' onClick={() => save.mutate({ expiresAt: null })}>
                    Never
                  </Button>
                )}
              </div>
              {!share.expiresAt && <p className='text-xs text-muted-foreground'>This link never expires.</p>}
            </div>

            <div className='flex flex-col gap-2'>
              <Label htmlFor='share-password'>Password</Label>
              {share.hasPassword && !editingPassword ? (
                <div className='flex items-center gap-2'>
                  <p className='flex flex-1 items-center gap-1.5 text-sm'>
                    <LockIcon className='size-4 text-muted-foreground' /> Visitors need a password
                  </p>
                  <Button variant='outline' size='sm' onClick={() => setEditingPassword(true)}>
                    Change
                  </Button>
                  <Button variant='ghost' size='sm' onClick={() => save.mutate({ password: null })}>
                    Remove
                  </Button>
                </div>
              ) : (
                <form
                  className='flex gap-2'
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (password) save.mutate({ password });
                  }}
                >
                  <Input
                    id='share-password'
                    type='password'
                    autoComplete='new-password'
                    placeholder='Optional'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button type='submit' variant='outline' disabled={!password || save.isPending}>
                    Set password
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}

        <DialogFooter className='sm:justify-between'>
          <Button
            variant='destructive'
            disabled={!share || stop.isPending}
            onClick={() => stop.mutate()}
          >
            Stop sharing
          </Button>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
