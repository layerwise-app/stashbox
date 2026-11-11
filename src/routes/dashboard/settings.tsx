import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MonitorIcon, MoonIcon, SunIcon, TriangleAlertIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { UserAvatar, profileKey, useProfile } from '~/components/files/app-shell';
import { PageTitle } from '~/components/files/folder-view';
import { errorMessage, useStorageInfo } from '~/components/files/queries';
import { authClient } from '~/lib/auth-client';
import { formatBytes } from '~/lib/files';
import { cn } from '~/lib/utils';
import {
  deleteAccount,
  removeAvatar,
  setPassword,
  updateName,
  uploadAvatar
} from '~/server/account.functions';
import { seo } from '~/utils/seo';

const TABS = ['general', 'security', 'plan'] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute('/dashboard/settings')({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== 'general' ? { tab: search.tab as Tab } : {},
  head: () => seo({ title: 'Settings · Stashbox', noindex: true }),
  component: SettingsPage
});

function SettingsPage() {
  const { tab = 'general' } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className='flex flex-1 flex-col'>
      <div className='px-4 pt-5 pb-1 sm:px-8 sm:pt-7'>
        <PageTitle>Settings</PageTitle>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({ to: '/dashboard/settings', search: value === 'general' ? {} : { tab: value as Tab }, replace: true })
        }
        className='gap-0 px-4 pb-24 sm:px-8'
      >
        <TabsList variant='line' className='w-full group-data-horizontal/tabs:h-auto justify-start gap-6 rounded-none border-b p-0'>
          {[
            ['general', 'General'],
            ['security', 'Security'],
            ['plan', 'Plan']
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className='-mb-px h-11 flex-none rounded-none border-0 border-b-2 border-transparent px-0.5 after:hidden data-active:border-foreground! data-active:text-foreground'
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className='max-w-3xl'>
          <TabsContent value='general'><GeneralTab /></TabsContent>
          <TabsContent value='security'><SecurityTab /></TabsContent>
          <TabsContent value='plan'><PlanTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/** A labelled row, like Dropbox's settings: label on the left, value and actions on the right. */
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className='grid gap-3 border-b py-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6'>
      <div>
        <p className='text-sm font-medium'>{label}</p>
        {hint && <p className='mt-0.5 text-xs text-muted-foreground'>{hint}</p>}
      </div>
      <div className='min-w-0'>{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className='pt-8 pb-1 text-base font-semibold'>{children}</h2>;
}

// ---- General -------------------------------------------------------------

function GeneralTab() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const refreshProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: profileKey });
    router.invalidate();
  };

  const saveName = useMutation({
    mutationFn: () => updateName({ data: { name } }),
    onSuccess: async () => {
      await refreshProfile();
      setEditingName(false);
      toast.success('Name updated');
    }
  });

  const photo = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set('file', file);
      return uploadAvatar({ data: form });
    },
    onSuccess: async () => {
      await refreshProfile();
      toast.success('Photo updated');
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const clearPhoto = useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: async () => {
      await refreshProfile();
      toast.success('Photo removed');
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  if (!profile.data) return <SettingsSkeleton />;
  const data = profile.data;

  return (
    <div>
      <SectionTitle>Profile</SectionTitle>
      <Row label='Photo' hint='PNG, JPG, WebP, or GIF, up to 5 MB.'>
        <div className='flex flex-wrap items-center gap-4'>
          <UserAvatar name={data.name || data.email} url={data.avatarUrl} className='size-16 text-lg' />
          <input
            ref={photoInput}
            type='file'
            accept='image/png,image/jpeg,image/webp,image/gif'
            hidden
            aria-label='Choose a profile photo'
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) photo.mutate(file);
              e.target.value = '';
            }}
          />
          <Button variant='outline' size='sm' disabled={photo.isPending} onClick={() => photoInput.current?.click()}>
            {photo.isPending ? 'Uploading…' : data.avatarUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {data.avatarUrl && (
            <Button variant='ghost' size='sm' disabled={clearPhoto.isPending} onClick={() => clearPhoto.mutate()}>
              Remove
            </Button>
          )}
        </div>
      </Row>
      <Row label='Name'>
        {editingName ? (
          <form
            className='flex flex-wrap items-start gap-2'
            onSubmit={(e) => {
              e.preventDefault();
              saveName.mutate();
            }}
          >
            <div className='min-w-56 flex-1'>
              <Input
                autoFocus
                aria-label='Name'
                value={name}
                maxLength={80}
                onChange={(e) => {
                  setName(e.target.value);
                  saveName.reset();
                }}
                onKeyDown={(e) => e.key === 'Escape' && setEditingName(false)}
              />
              {saveName.error && <p className='mt-1.5 text-sm text-destructive'>{errorMessage(saveName.error)}</p>}
            </div>
            <Button type='submit' size='sm' className='h-9' disabled={saveName.isPending || !name.trim()}>
              Save
            </Button>
            <Button type='button' variant='ghost' size='sm' className='h-9' onClick={() => setEditingName(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className='flex items-center justify-between gap-4'>
            <p className={cn('truncate text-sm', !data.name && 'text-muted-foreground')}>{data.name || 'Not set'}</p>
            <Button
              variant='link'
              size='sm'
              className='h-auto px-0'
              onClick={() => {
                setName(data.name);
                setEditingName(true);
              }}
            >
              Edit
            </Button>
          </div>
        )}
      </Row>
      <Row label='Email' hint='Used to sign in and to receive sign-in codes.'>
        <p className='truncate text-sm'>{data.email}</p>
      </Row>
      <Row label='Member since'>
        <p className='text-sm'>
          {new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(data.createdAt))}
        </p>
      </Row>

      <SectionTitle>Preferences</SectionTitle>
      <Row label='Appearance' hint='System follows your device’s light or dark setting.'>
        <ToggleGroup
          type='single'
          variant='outline'
          value={mounted ? (theme ?? 'system') : 'system'}
          onValueChange={(value) => value && setTheme(value)}
          aria-label='Appearance'
        >
          <ToggleGroupItem value='system' className='gap-1.5 px-3'>
            <MonitorIcon /> System
          </ToggleGroupItem>
          <ToggleGroupItem value='light' className='gap-1.5 px-3'>
            <SunIcon /> Light
          </ToggleGroupItem>
          <ToggleGroupItem value='dark' className='gap-1.5 px-3'>
            <MoonIcon /> Dark
          </ToggleGroupItem>
        </ToggleGroup>
      </Row>
    </div>
  );
}

// ---- Security ------------------------------------------------------------

function SecurityTab() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const resetPasswordForm = () => {
    setPasswordOpen(false);
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const savePassword = useMutation({
    mutationFn: async () => {
      if (next.length < 8) throw new Error('Use at least 8 characters.');
      if (next !== confirm) throw new Error('The new passwords don’t match.');
      if (profile.data?.hasPassword) {
        const { error } = await authClient.changePassword({
          currentPassword: current,
          newPassword: next,
          revokeOtherSessions: signOutOthers
        });
        if (error)
          throw new Error(
            error.code === 'INVALID_PASSWORD' ? 'Your current password isn’t right.' : (error.message ?? 'Couldn’t change your password.')
          );
      } else {
        await setPassword({ data: { newPassword: next } });
      }
    },
    onSuccess: async () => {
      const added = !profile.data?.hasPassword;
      resetPasswordForm();
      await queryClient.invalidateQueries({ queryKey: profileKey });
      toast.success(added ? 'Password set. You can now sign in with it.' : 'Password changed');
    }
  });

  const revokeOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message ?? 'Couldn’t sign out other devices.');
    },
    onSuccess: () => toast.success('Signed out of all other devices'),
    onError: (error) => toast.error(errorMessage(error))
  });

  if (!profile.data) return <SettingsSkeleton />;
  const hasPassword = profile.data.hasPassword;

  return (
    <div>
      <SectionTitle>Sign in</SectionTitle>
      <Row
        label='Password'
        hint={hasPassword ? undefined : 'You sign in with email codes. Add a password to sign in with it too.'}
      >
        {passwordOpen ? (
          <form
            className='flex max-w-sm flex-col gap-3'
            onSubmit={(e) => {
              e.preventDefault();
              savePassword.mutate();
            }}
          >
            {hasPassword && (
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor='current-password'>Current password</Label>
                <Input id='current-password' type='password' autoComplete='current-password' required value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
            )}
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='new-password'>New password</Label>
              <Input id='new-password' type='password' autoComplete='new-password' required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='confirm-password'>Confirm new password</Label>
              <Input id='confirm-password' type='password' autoComplete='new-password' required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {hasPassword && (
              <Label className='flex items-center gap-2 font-normal'>
                <Checkbox checked={signOutOthers} onCheckedChange={(v) => setSignOutOthers(v === true)} />
                Sign out of other devices
              </Label>
            )}
            {savePassword.error && <p className='text-sm text-destructive'>{errorMessage(savePassword.error)}</p>}
            <div className='flex gap-2'>
              <Button type='submit' disabled={savePassword.isPending}>
                {hasPassword ? 'Change password' : 'Set password'}
              </Button>
              <Button type='button' variant='ghost' onClick={resetPasswordForm}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className='flex items-center justify-between gap-4'>
            <p className='text-sm'>{hasPassword ? '••••••••••' : <Badge variant='secondary'>Not set</Badge>}</p>
            <Button variant='link' size='sm' className='h-auto px-0' onClick={() => setPasswordOpen(true)}>
              {hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </div>
        )}
      </Row>
      <Row label='Other devices' hint='Signs out every browser except this one.'>
        <Button variant='outline' size='sm' disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
          Sign out of all other devices
        </Button>
      </Row>

      <SectionTitle>Delete account</SectionTitle>
      <div className='mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5'>
        <p className='text-sm'>
          Deleting your account permanently removes all of your files and folders, including those in
          Trash, and turns off every share link. This can’t be undone.
        </p>
        <Button variant='destructive' className='mt-4' onClick={() => setDeleteOpen(true)}>
          Delete account
        </Button>
      </div>
      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        email={profile.data.email}
        hasPassword={hasPassword}
      />
    </div>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  hasPassword
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  hasPassword: boolean;
}) {
  const storage = useStorageInfo();
  const [typed, setTyped] = useState('');
  const [password, setPasswordValue] = useState('');
  useEffect(() => {
    if (!open) {
      setTyped('');
      setPasswordValue('');
    }
  }, [open]);

  const remove = useMutation({
    mutationFn: () =>
      deleteAccount({ data: { confirmEmail: typed, password: hasPassword ? password : undefined } }),
    onSuccess: () => {
      window.location.href = '/?account=deleted';
    }
  });

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={(value) => !remove.isPending && onOpenChange(value)}>
      <AlertDialogContent>
        <form
          className='flex flex-col gap-4'
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) remove.mutate();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <TriangleAlertIcon className='size-5 text-destructive' /> Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {storage.data
                ? `${formatBytes(storage.data.usedBytes)} of files and folders will be deleted forever, and your share links will stop working.`
                : 'All of your files and folders will be deleted forever, and your share links will stop working.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='confirm-email'>
              Type <span className='font-semibold'>{email}</span> to confirm
            </Label>
            <Input
              id='confirm-email'
              autoComplete='off'
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                remove.reset();
              }}
            />
          </div>
          {hasPassword && (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='delete-password'>Password</Label>
              <Input
                id='delete-password'
                type='password'
                autoComplete='current-password'
                value={password}
                onChange={(e) => {
                  setPasswordValue(e.target.value);
                  remove.reset();
                }}
              />
            </div>
          )}
          {remove.error && <p className='text-sm text-destructive'>{errorMessage(remove.error)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel type='button' disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type='submit'
              className='bg-destructive text-white hover:bg-destructive/90'
              disabled={!matches || (hasPassword && !password) || remove.isPending}
            >
              {remove.isPending ? 'Deleting…' : 'Delete account forever'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Plan ----------------------------------------------------------------

function PlanTab() {
  const { data } = useStorageInfo();
  if (!data) return <SettingsSkeleton />;
  const files = Math.max(0, data.usedBytes - data.trashBytes);
  const free = Math.max(0, data.limitBytes - data.usedBytes);
  const pct = (bytes: number) => `${Math.min(100, (bytes / data.limitBytes) * 100)}%`;

  return (
    <div>
      <SectionTitle>Your plan</SectionTitle>
      <div className='mt-3 rounded-lg border p-5'>
        <div className='flex flex-wrap items-baseline justify-between gap-2'>
          <p className='text-lg font-semibold'>{data.planName}</p>
          <p className='text-sm text-muted-foreground'>{formatBytes(data.limitBytes)} of storage</p>
        </div>
        <div
          className='mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted'
          role='img'
          aria-label={`${formatBytes(data.usedBytes)} of ${formatBytes(data.limitBytes)} used`}
        >
          <div className='bg-primary' style={{ width: pct(files) }} />
          <div className='bg-amber-400' style={{ width: pct(data.trashBytes) }} />
        </div>
        <dl className='mt-4 grid gap-3 text-sm sm:grid-cols-3'>
          <Legend color='bg-primary' label='Files' value={formatBytes(files)} />
          <Legend color='bg-amber-400' label='Trash' value={formatBytes(data.trashBytes)} />
          <Legend color='bg-muted border' label='Available' value={formatBytes(free)} />
        </dl>
      </div>
      <Row label='Largest file' hint='The biggest single file you can upload.'>
        <p className='text-sm'>{formatBytes(data.maxFileBytes)}</p>
      </Row>
      <Row label='Free up space' hint='Files in Trash count toward your storage until you delete them forever.'>
        <Button variant='outline' size='sm' asChild>
          <Link to='/dashboard/trash'>Go to Trash</Link>
        </Button>
      </Row>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className='flex items-center gap-2'>
      <span className={`size-2.5 rounded-full ${color}`} />
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='ml-auto font-medium tabular-nums sm:ml-1'>{value}</dd>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className='space-y-4 pt-8'>
      {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className='h-12' />)}
    </div>
  );
}
