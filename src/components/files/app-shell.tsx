import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ClockIcon,
  FolderIcon,
  HardDriveIcon,
  LinkIcon,
  LogOutIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
  XIcon
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { Progress } from '~/components/ui/progress';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from '~/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { Logo } from '~/components/logo';
import { useStorageInfo } from '~/components/files/queries';
import { signOut } from '~/lib/auth-client';
import { formatBytes } from '~/lib/files';
import { cn } from '~/lib/utils';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  getProfile
} from '~/server/account.functions';

const NAV = [
  { to: '/dashboard', label: 'All files', icon: FolderIcon },
  { to: '/dashboard/recent', label: 'Recent', icon: ClockIcon },
  { to: '/dashboard/starred', label: 'Starred', icon: StarIcon },
  { to: '/dashboard/shared', label: 'Shared links', icon: LinkIcon },
  { to: '/dashboard/trash', label: 'Trash', icon: Trash2Icon }
] as const;

export const profileKey = ['profile'] as const;

export function useProfile() {
  return useQuery({ queryKey: profileKey, queryFn: () => getProfile(), staleTime: 5 * 60 * 1000 });
}

export function UserAvatar({
  name,
  url,
  className
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  const initials = (name.trim() || '?')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt='' className='object-cover' />}
      <AvatarFallback className='bg-primary text-xs font-semibold text-primary-foreground'>
        {initials || '?'}
      </AvatarFallback>
    </Avatar>
  );
}

export function AppShell({
  user,
  sidebar,
  children
}: {
  user: { name: string; email: string };
  sidebar: { open: boolean; width: number };
  children: ReactNode;
}) {
  const [width, setWidth] = useState(sidebar.width);
  return (
    <SidebarProvider
      defaultOpen={sidebar.open}
      style={{ '--sidebar-width': `${width}px` } as React.CSSProperties}
    >
      <AppSidebar width={width} onWidthChange={setWidth} />
      <SidebarInset className='h-svh min-w-0 overflow-hidden'>
        <AppHeader user={user} />
        <div id='main' className='@container flex min-h-0 flex-1 flex-col overflow-y-auto'>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function saveWidth(width: number) {
  document.cookie = `sidebar_width=${Math.round(width)}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

/**
 * The sidebar's right edge: drag to resize, click to collapse or expand,
 * double-click to reset. Arrow keys resize when it has focus.
 */
function SidebarResizer({ width, onWidthChange }: { width: number; onWidthChange: (w: number) => void }) {
  const { open, setOpen } = useSidebar();
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const clamp = (w: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w));

  return (
    <div
      role='separator'
      aria-orientation='vertical'
      aria-label='Resize sidebar'
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={open ? width : 0}
      tabIndex={0}
      title='Drag to resize · Click to collapse'
      className='group/resizer absolute inset-y-0 -right-1.5 z-20 hidden w-3 cursor-col-resize outline-none md:block'
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, start: open ? width : 48, moved: false };
        document.documentElement.dataset.sidebarResizing = '';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (!d.moved && Math.abs(dx) < 4) return;
        d.moved = true;
        const next = d.start + dx;
        // Dragging well past the minimum folds the sidebar to icons.
        if (next < SIDEBAR_MIN_WIDTH - 70) {
          if (open) setOpen(false);
        } else {
          if (!open) setOpen(true);
          onWidthChange(clamp(next));
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        delete document.documentElement.dataset.sidebarResizing;
        e.currentTarget.releasePointerCapture(e.pointerId);
        if (!d) return;
        if (d.moved) saveWidth(clamp(d.start + e.clientX - d.x));
        else setOpen(!open);
      }}
      onPointerCancel={() => {
        drag.current = null;
        delete document.documentElement.dataset.sidebarResizing;
      }}
      onDoubleClick={() => {
        setOpen(true);
        onWidthChange(SIDEBAR_DEFAULT_WIDTH);
        saveWidth(SIDEBAR_DEFAULT_WIDTH);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const next = clamp(width + (e.key === 'ArrowRight' ? 16 : -16));
          if (!open) setOpen(true);
          onWidthChange(next);
          saveWidth(next);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(!open);
        }
      }}
    >
      <span className='absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover/resizer:bg-primary group-focus-visible/resizer:bg-primary group-active/resizer:bg-primary' />
    </div>
  );
}

function AppSidebar({ width, onWidthChange }: { width: number; onWidthChange: (w: number) => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();
  const isActive = (to: string) =>
    to === '/dashboard'
      ? pathname === '/dashboard' || pathname.startsWith('/dashboard/folder')
      : pathname.startsWith(to);

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader className='h-14 justify-center px-3 group-data-[collapsible=icon]:px-2'>
        <Link
          to='/dashboard'
          className='flex items-center gap-2.5 px-1 text-[17px] font-semibold tracking-tight group-data-[collapsible=icon]:px-0'
          onClick={() => setOpenMobile(false)}
        >
          <Logo className='size-7' />
          <span className='group-data-[collapsible=icon]:hidden'>Stashbox</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className='pt-1'>
          <SidebarGroupContent>
            <SidebarMenu className='gap-0.5'>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.to)}
                    tooltip={item.label}
                    className='h-9 font-normal data-[active=true]:font-semibold'
                  >
                    <Link to={item.to} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className='p-3'>
        <StorageMeter />
      </SidebarFooter>
      <SidebarResizer width={width} onWidthChange={onWidthChange} />
    </Sidebar>
  );
}

function StorageMeter() {
  const { data } = useStorageInfo();
  const { setOpenMobile } = useSidebar();
  const percent = data ? Math.min(100, (data.usedBytes / data.limitBytes) * 100) : 0;
  const summary = data
    ? `${formatBytes(data.usedBytes)} of ${formatBytes(data.limitBytes)} used`
    : 'Loading…';
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to='/dashboard/settings'
            search={{ tab: 'plan' }}
            className='hidden size-8 items-center justify-center self-center rounded-md hover:bg-sidebar-accent group-data-[collapsible=icon]:flex'
            aria-label={`Storage: ${summary}`}
          >
            <HardDriveIcon className='size-4' />
          </Link>
        </TooltipTrigger>
        <TooltipContent side='right'>{summary}</TooltipContent>
      </Tooltip>
      <div className='space-y-2 px-1 pb-1 group-data-[collapsible=icon]:hidden' aria-label='Storage'>
        <Progress
          value={percent}
          className={cn('h-1.5 bg-sidebar-accent', percent > 90 && '[&>[data-slot=progress-indicator]]:bg-destructive')}
          aria-label={`${Math.round(percent)}% of storage used`}
        />
        <p className='text-xs text-muted-foreground'>{summary}</p>
        <Link
          to='/dashboard/settings'
          search={{ tab: 'plan' }}
          onClick={() => setOpenMobile(false)}
          className='text-xs font-medium text-primary hover:underline'
        >
          {data?.planName ?? 'Plan'} · Manage storage
        </Link>
      </div>
    </>
  );
}

function AppHeader({ user }: { user: { name: string; email: string } }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const location = useRouterState({ select: (s) => s.location });
  const urlQuery =
    location.pathname === '/dashboard/search'
      ? String((location.search as { q?: string }).q ?? '')
      : '';
  const [query, setQuery] = useState(urlQuery);

  useEffect(() => setQuery(urlQuery), [urlQuery]);

  // Search as you type, replacing history so Back leaves search.
  useEffect(() => {
    const q = query.trim();
    if (q === urlQuery.trim()) return;
    const timer = setTimeout(() => {
      if (q) navigate({ to: '/dashboard/search', search: { q }, replace: location.pathname === '/dashboard/search' });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, urlQuery, navigate, location.pathname]);

  const email = profile.data?.email ?? user.email;
  // People who signed up with an email code may not have a name yet.
  const name = (profile.data?.name ?? user.name) || email;

  return (
    <header className='flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-4'>
      <SidebarTrigger aria-label='Toggle sidebar' className='text-muted-foreground' />
      <form
        role='search'
        className='relative max-w-2xl flex-1'
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) navigate({ to: '/dashboard/search', search: { q: query.trim() } });
        }}
      >
        <SearchIcon className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
        <input
          type='search'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search'
          aria-label='Search files and folders'
          className='h-10 w-full rounded-lg border border-transparent bg-muted pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground hover:border-input focus-visible:border-primary focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden'
        />
        {query && (
          <button
            type='button'
            aria-label='Clear search'
            className='absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-accent'
            onClick={() => {
              setQuery('');
              if (location.pathname === '/dashboard/search') navigate({ to: '/dashboard' });
            }}
          >
            <XIcon className='size-3.5' />
          </button>
        )}
      </form>
      <div className='ml-auto'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='rounded-full' aria-label='Account'>
              <UserAvatar name={name} url={profile.data?.avatarUrl} className='size-8' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-64'>
            <DropdownMenuLabel className='flex items-center gap-3 font-normal'>
              <UserAvatar name={name} url={profile.data?.avatarUrl} className='size-10' />
              <span className='min-w-0'>
                <span className='block truncate font-medium'>{name}</span>
                <span className='block truncate text-xs text-muted-foreground'>{email}</span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to='/dashboard/settings'>
                <SettingsIcon />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await signOut();
                window.location.href = '/';
              }}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
