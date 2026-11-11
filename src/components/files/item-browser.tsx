import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  LockIcon,
  PencilIcon,
  PlayIcon,
  Share2Icon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
  type LucideIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '~/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { Skeleton } from '~/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '~/components/ui/toggle-group';
import { useFileActions } from '~/components/files/actions';
import { FileIcon } from '~/components/files/file-icon';
import { errorMessage, usePersistentState, useRefreshFiles } from '~/components/files/queries';
import { fileKind, formatBytes, formatDate, type Item } from '~/lib/files';
import { cn } from '~/lib/utils';
import { getSignedUrls, renameItem } from '~/server/files.functions';

export type MenuEntry = {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
};

type SortKey = 'name' | 'modified' | 'size';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortItems(list: Item[], sort: Sort) {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    let diff = 0;
    if (sort.key === 'modified') diff = +new Date(a.updatedAt) - +new Date(b.updatedAt);
    else if (sort.key === 'size') diff = a.size - b.size;
    if (diff === 0) diff = collator.compare(a.name, b.name);
    return diff * sign;
  });
}

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    setCoarse(query.matches);
    const onChange = () => setCoarse(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return coarse;
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function overlayOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"], [data-preview], [role="menu"]');
}

// Columns follow the width of the content area (container queries), so
// they adapt to the sidebar's width as well as the window's. Columns:
// checkbox · name · location? · who can access · modified · size · actions.
const COLUMNS = {
  plain:
    'grid-cols-[1.75rem_minmax(0,1fr)_2.5rem] @2xl:grid-cols-[1.75rem_minmax(0,1fr)_9rem_5rem_2.5rem] @4xl:grid-cols-[1.75rem_minmax(0,1fr)_9rem_5rem_7rem] @5xl:grid-cols-[1.75rem_minmax(0,1fr)_10rem_9rem_5rem_7rem]',
  located:
    'grid-cols-[1.75rem_minmax(0,1fr)_2.5rem] @2xl:grid-cols-[1.75rem_minmax(0,1fr)_9rem_5rem_2.5rem] @4xl:grid-cols-[1.75rem_minmax(0,1fr)_9rem_5rem_7rem] @5xl:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,13rem)_9rem_5rem_7rem] @6xl:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,14rem)_10rem_9rem_5rem_7rem]'
};
// Columns appear only once the name column keeps at least ~250px.
const SHOW = {
  location: 'hidden @5xl:block',
  locationInline: '@5xl:hidden',
  access: { plain: 'hidden @5xl:flex', located: 'hidden @6xl:flex' },
  accessInline: { plain: '@5xl:hidden', located: '@6xl:hidden' },
  wide: 'hidden @2xl:block',
  narrow: '@2xl:hidden',
  share: 'hidden @4xl:inline-flex'
};

export function ItemBrowser({
  items,
  isLoading,
  error,
  folderId,
  showLocation = false,
  sortable = true,
  title,
  description,
  toolbar,
  empty,
  backgroundMenu = [],
  onDropFiles,
  dropLabel
}: {
  items: Item[] | undefined;
  isLoading: boolean;
  error?: unknown;
  /** Set on folder views; used as the Move/Copy starting point. */
  folderId?: string | null;
  showLocation?: boolean;
  sortable?: boolean;
  title: ReactNode;
  /** Shown in the action row when the page has no actions of its own. */
  description?: ReactNode;
  toolbar?: ReactNode;
  empty: ReactNode;
  backgroundMenu?: MenuEntry[];
  onDropFiles?: (dataTransfer: DataTransfer) => void;
  dropLabel?: string;
}) {
  const navigate = useNavigate();
  const actions = useFileActions();
  const refresh = useRefreshFiles();
  const coarse = useCoarsePointer();
  const [view, setView] = usePersistentState<'list' | 'grid'>('stashbox:view', 'list');
  const [savedSort, setSort] = usePersistentState<Sort>('stashbox:sort', { key: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const longPress = useRef<{ timer?: ReturnType<typeof setTimeout>; fired?: boolean }>({});
  const pointerType = useRef<string>('mouse');
  const layout = showLocation ? 'located' : 'plain';

  const sort = sortable ? savedSort : null;
  const sorted = useMemo(
    () => (items ? (sort ? sortItems(items, sort) : items) : []),
    [items, sort]
  );
  const files = useMemo(() => sorted.filter((i) => i.type === 'file'), [sorted]);
  const selectedItems = useMemo(() => sorted.filter((i) => selected.has(i.id)), [sorted, selected]);

  // Drop selections of items that left the list.
  useEffect(() => {
    if (!items) return;
    const ids = new Set(items.map((i) => i.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const open = useCallback(
    (item: Item) => {
      if (item.type === 'folder') {
        navigate({ to: '/dashboard/folder/$folderId', params: { folderId: item.id } });
      } else {
        actions.openPreview(files, files.findIndex((f) => f.id === item.id));
      }
    },
    [actions, files, navigate]
  );

  const goToFolder = useCallback(
    (id: string | null) =>
      id
        ? navigate({ to: '/dashboard/folder/$folderId', params: { folderId: id } })
        : navigate({ to: '/dashboard' }),
    [navigate]
  );

  const menuFor = useCallback(
    (targets: Item[]): MenuEntry[] => {
      if (!targets.length) return [];
      const single = targets.length === 1 ? targets[0] : null;
      const allStarred = targets.every((t) => t.starred);
      const start = folderId !== undefined ? folderId : targets[0].parentId;
      const entries: MenuEntry[] = [];
      if (single)
        entries.push({ key: 'open', label: 'Open', icon: ExternalLinkIcon, onSelect: () => open(single) });
      if (single && showLocation)
        entries.push({
          key: 'location',
          label: 'Show in folder',
          icon: FolderInputIcon,
          onSelect: () => goToFolder(single.parentId)
        });
      if (single)
        entries.push({ key: 'share', label: 'Share', icon: Share2Icon, onSelect: () => actions.share(single), separatorBefore: true });
      entries.push(
        { key: 'download', label: 'Download', icon: DownloadIcon, onSelect: () => actions.download(targets) },
        ...(single
          ? [{ key: 'rename', label: 'Rename', icon: PencilIcon, onSelect: () => setRenamingId(single.id), separatorBefore: true }]
          : []),
        { key: 'move', label: 'Move', icon: FolderInputIcon, onSelect: () => actions.moveOrCopy('move', targets, start), separatorBefore: !single },
        { key: 'copy', label: 'Copy', icon: CopyIcon, onSelect: () => actions.moveOrCopy('copy', targets, start) },
        {
          key: 'star',
          label: allStarred ? 'Unstar' : 'Star',
          icon: allStarred ? StarOffIcon : StarIcon,
          onSelect: () => actions.star(targets, !allStarred)
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: Trash2Icon,
          destructive: true,
          separatorBefore: true,
          onSelect: () => {
            setSelected(new Set());
            actions.trash(targets);
          }
        }
      );
      return entries;
    },
    [actions, folderId, goToFolder, open, showLocation]
  );

  // Keyboard: ⌘A, Escape, Delete, Enter, F2.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || overlayOpen()) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(new Set(sorted.map((i) => i.id)));
      } else if (event.key === 'Escape') {
        setSelected(new Set());
      } else if ((event.key === 'Delete' || (mod && event.key === 'Backspace')) && selectedItems.length) {
        event.preventDefault();
        setSelected(new Set());
        actions.trash(selectedItems);
      } else if (event.key === 'Enter' && selectedItems.length === 1) {
        event.preventDefault();
        open(selectedItems[0]);
      } else if (event.key === 'F2' && selectedItems.length === 1) {
        event.preventDefault();
        setRenamingId(selectedItems[0].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, open, selectedItems, sorted]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onItemClick = (event: React.MouseEvent, item: Item) => {
    event.stopPropagation();
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      toggle(item.id);
      setAnchor(item.id);
    } else if (event.shiftKey && anchor) {
      const a = sorted.findIndex((i) => i.id === anchor);
      const b = sorted.findIndex((i) => i.id === item.id);
      if (a < 0) return;
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelected(new Set(sorted.slice(from, to + 1).map((i) => i.id)));
    } else if (pointerType.current === 'touch') {
      // On touch screens a tap opens; once selecting, taps add to the selection.
      if (selected.size) toggle(item.id);
      else open(item);
    } else {
      setSelected(new Set([item.id]));
      setAnchor(item.id);
    }
  };

  const pressHandlers = (item: Item) => ({
    onPointerDown: (event: React.PointerEvent) => {
      pointerType.current = event.pointerType;
      if (event.pointerType !== 'touch') return;
      clearTimeout(longPress.current.timer);
      longPress.current.fired = false;
      longPress.current.timer = setTimeout(() => {
        longPress.current.fired = true;
        setSelected((current) => new Set(current).add(item.id));
        setAnchor(item.id);
        navigator.vibrate?.(10);
      }, 450);
    },
    onPointerUp: () => clearTimeout(longPress.current.timer),
    onPointerCancel: () => clearTimeout(longPress.current.timer),
    onPointerMove: (event: React.PointerEvent) => {
      if (event.pointerType === 'touch' && (Math.abs(event.movementX) > 4 || Math.abs(event.movementY) > 4))
        clearTimeout(longPress.current.timer);
    }
  });

  // Right-click selects the item under the pointer before the menu opens.
  const [menuItems, setMenuItems] = useState<MenuEntry[]>([]);
  const onContextMenuCapture = (event: React.MouseEvent) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
    const id = row?.dataset.itemId;
    if (!id) {
      setSelected(new Set());
      setMenuItems(backgroundMenu);
      return;
    }
    let targets = selectedItems;
    if (!selected.has(id)) {
      setSelected(new Set([id]));
      setAnchor(id);
      targets = sorted.filter((i) => i.id === id);
    }
    setMenuItems(menuFor(targets));
  };

  const commitRename = async (item: Item, name: string) => {
    if (!name.trim() || name === item.name) {
      setRenamingId(null);
      return;
    }
    try {
      await renameItem({ data: { id: item.id, name } });
      setRenamingId(null);
      await refresh();
      toast.success(`Renamed to “${name.trim()}”`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  // Thumbnails: images in both views, video frames in grid view.
  const mediaIds = useMemo(
    () =>
      sorted
        .filter((i) => {
          if (i.type !== 'file') return false;
          const kind = fileKind(i.name, i.mimeType);
          return kind === 'image' || (view === 'grid' && kind === 'video');
        })
        .map((i) => i.id)
        .slice(0, 200),
    [sorted, view]
  );
  const thumbs = useQuery({
    queryKey: ['thumbs', mediaIds.join(',')],
    queryFn: () => getSignedUrls({ data: { ids: mediaIds } }),
    enabled: mediaIds.length > 0,
    staleTime: 10 * 60 * 1000
  });

  const dropHandlers = onDropFiles
    ? {
        onDragEnter: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          onDropFiles(e.dataTransfer);
        }
      }
    : {};

  const showCheckboxes = coarse || selected.size > 0;
  const allChecked =
    selected.size > 0 && selected.size === sorted.length ? true : selected.size > 0 ? 'indeterminate' : false;
  const selectAll = (
    <Checkbox
      aria-label='Select all'
      className={cn(!showCheckboxes && 'opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100')}
      checked={allChecked}
      onClick={(e) => e.stopPropagation()}
      onCheckedChange={() =>
        setSelected(selected.size === sorted.length ? new Set() : new Set(sorted.map((i) => i.id)))
      }
    />
  );

  const sortHeader = (key: SortKey, label: string, className?: string) => (
    <button
      type='button'
      disabled={!sort}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1 py-0.5 text-left -mx-1 hover:bg-accent hover:text-foreground disabled:pointer-events-none',
        sort?.key === key && 'text-foreground',
        className
      )}
      onClick={() =>
        sort && setSort({ key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' })
      }
    >
      {label}
      {sort?.key === key &&
        (sort.dir === 'asc' ? <ArrowUpIcon className='size-3' /> : <ArrowDownIcon className='size-3' />)}
    </button>
  );

  const showHeader = !error && !isLoading && sorted.length > 0;

  return (
    <div className='flex flex-1 flex-col'>
      <div className='flex items-center gap-3 px-4 pt-5 pb-1 sm:px-8 sm:pt-7'>
        <div className='min-w-0 flex-1'>{title}</div>
      </div>

      <div className='sticky top-0 z-10 bg-background px-4 sm:px-8'>
        <div className='flex min-h-14 items-center gap-2 py-2.5'>
          {selectedItems.length > 0 ? (
            <SelectionBar
              count={selectedItems.length}
              entries={menuFor(selectedItems).filter((e) => e.key !== 'open' && e.key !== 'location')}
              onClear={() => setSelected(new Set())}
            />
          ) : (
            <>
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                {toolbar ?? <p className='truncate text-sm text-muted-foreground'>{description}</p>}
              </div>
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
            </>
          )}
        </div>

        {showHeader &&
          (view === 'list' ? (
            <div
              role='row'
              className={cn(
                'group/head grid items-center gap-3 border-b px-2 py-2 text-xs font-medium text-muted-foreground',
                COLUMNS[layout]
              )}
            >
              <div role='columnheader' className='flex justify-center'>{selectAll}</div>
              <div role='columnheader'>{sortHeader('name', 'Name')}</div>
              {showLocation && <div role='columnheader' className={SHOW.location}>Location</div>}
              <div role='columnheader' className={SHOW.access[layout]}>Who can access</div>
              <div role='columnheader' className={SHOW.wide}>{sortHeader('modified', 'Modified')}</div>
              <div role='columnheader' className={cn(SHOW.wide, 'text-right')}>{sortHeader('size', 'Size')}</div>
              <div role='columnheader'><span className='sr-only'>Actions</span></div>
            </div>
          ) : (
            // Grid view has no columns, so its sort controls get a strip of their own.
            <div className='group/head flex items-center gap-4 border-b px-2 py-2 text-xs font-medium text-muted-foreground'>
              <span className='flex w-5 justify-center'>{selectAll}</span>
              {sortHeader('name', 'Name')}
              {sortHeader('modified', 'Modified')}
              {sortHeader('size', 'Size')}
            </div>
          ))}
      </div>

      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild disabled={coarse}>
          <div
            className='relative flex min-h-0 flex-1 flex-col select-none [-webkit-touch-callout:none]'
            onClick={() => setSelected(new Set())}
            onContextMenuCapture={onContextMenuCapture}
            {...dropHandlers}
          >
            {error ? (
              <p className='px-4 py-6 text-sm text-destructive sm:px-8'>{errorMessage(error)}</p>
            ) : isLoading ? (
              <LoadingRows />
            ) : sorted.length === 0 ? (
              <div className='flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:px-8 sm:pt-10'>{empty}</div>
            ) : view === 'list' ? (
              <div role='grid' aria-label='Files' aria-multiselectable className='px-4 pb-24 sm:px-8'>
                {sorted.map((item) => {
                  const isSelected = selected.has(item.id);
                  const thumb = thumbs.data?.[item.id];
                  return (
                    <div
                      key={item.id}
                      role='row'
                      aria-selected={isSelected}
                      data-item-id={item.id}
                      onClick={(e) => onItemClick(e, item)}
                      onDoubleClick={() => open(item)}
                      {...pressHandlers(item)}
                      className={cn(
                        'group grid min-h-14 cursor-default items-center gap-3 border-b px-2 py-2 text-sm',
                        COLUMNS[layout],
                        isSelected ? 'bg-selection' : 'hover:bg-muted'
                      )}
                    >
                      <div role='gridcell' className='flex justify-center'>
                        <Checkbox
                          aria-label={`Select ${item.name}`}
                          checked={isSelected}
                          className={cn(!showCheckboxes && !isSelected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => {
                            toggle(item.id);
                            setAnchor(item.id);
                          }}
                        />
                      </div>
                      <div role='gridcell' className='flex min-w-0 items-center gap-3'>
                        {thumb ? (
                          <img src={thumb} alt='' loading='lazy' draggable={false} className='size-9 shrink-0 rounded-md border bg-muted object-cover' />
                        ) : (
                          <FileIcon item={item} className='size-9' />
                        )}
                        <div className='min-w-0 flex-1'>
                          {renamingId === item.id ? (
                            <RenameInput item={item} onDone={(name) => commitRename(item, name)} />
                          ) : (
                            <div className='flex min-w-0 items-center gap-1.5'>
                              <button
                                type='button'
                                className='truncate text-left font-medium hover:underline'
                                onClick={(e) => {
                                  if (e.metaKey || e.ctrlKey || e.shiftKey || pointerType.current === 'touch') return;
                                  e.stopPropagation();
                                  setSelected(new Set([item.id]));
                                  open(item);
                                }}
                              >
                                {item.name}
                              </button>
                              <StarToggle item={item} coarse={coarse} />
                              {item.shared && (
                                <LinkIcon className={cn('size-3.5 shrink-0 text-muted-foreground', SHOW.accessInline[layout])} aria-label='Shared' />
                              )}
                            </div>
                          )}
                          <p className={cn('truncate text-xs text-muted-foreground', SHOW.narrow)}>
                            {formatDate(item.updatedAt)}
                            {item.type === 'file' && ` · ${formatBytes(item.size)}`}
                          </p>
                          {showLocation && item.location && (
                            <p className={cn('truncate text-xs text-muted-foreground', SHOW.locationInline)}>{item.location.path}</p>
                          )}
                        </div>
                      </div>
                      {showLocation && (
                        <div role='gridcell' className={cn('truncate text-muted-foreground', SHOW.location)}>
                          <button
                            type='button'
                            className='max-w-full truncate text-left hover:text-foreground hover:underline'
                            onClick={(e) => {
                              e.stopPropagation();
                              goToFolder(item.parentId);
                            }}
                            title={item.location?.path}
                          >
                            {item.location?.path}
                          </button>
                        </div>
                      )}
                      <div role='gridcell' className={cn('items-center gap-1.5 text-muted-foreground', SHOW.access[layout])}>
                        {item.shared ? (
                          <>
                            <LinkIcon className='size-3.5' /> Anyone with link
                          </>
                        ) : (
                          <>
                            <LockIcon className='size-3.5' /> Only you
                          </>
                        )}
                      </div>
                      <div role='gridcell' className={cn('text-muted-foreground', SHOW.wide)}>
                        {formatDate(item.updatedAt)}
                      </div>
                      <div role='gridcell' className={cn('text-right text-muted-foreground tabular-nums', SHOW.wide)}>
                        {item.type === 'file' ? formatBytes(item.size) : '—'}
                      </div>
                      <div role='gridcell' className='flex items-center justify-end gap-1'>
                        {!coarse && (
                          <Button
                            variant='outline'
                            size='sm'
                            className={cn(
                              SHOW.share,
                              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              actions.share(item);
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            Share
                          </Button>
                        )}
                        <RowMenu entries={menuFor([item])} name={item.name} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                role='grid'
                aria-label='Files'
                aria-multiselectable
                className='grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 px-4 pt-3 pb-24 sm:px-8'
              >
                {sorted.map((item) => {
                  const isSelected = selected.has(item.id);
                  const kind = item.type === 'file' ? fileKind(item.name, item.mimeType) : null;
                  const thumb = thumbs.data?.[item.id];
                  return (
                    <div
                      key={item.id}
                      role='gridcell'
                      aria-selected={isSelected}
                      data-item-id={item.id}
                      onClick={(e) => onItemClick(e, item)}
                      onDoubleClick={() => open(item)}
                      {...pressHandlers(item)}
                      className={cn(
                        'group relative flex cursor-default flex-col rounded-lg p-2',
                        isSelected ? 'bg-selection ring-1 ring-primary/40' : 'hover:bg-muted'
                      )}
                    >
                      <div className='relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted/70'>
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
                        <Checkbox
                          aria-label={`Select ${item.name}`}
                          checked={isSelected}
                          className={cn(
                            'absolute top-2 left-2 bg-background shadow-sm',
                            !showCheckboxes && !isSelected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                          )}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => {
                            toggle(item.id);
                            setAnchor(item.id);
                          }}
                        />
                      </div>
                      <div className='flex items-start gap-1 pt-2'>
                        <div className='min-w-0 flex-1 px-0.5'>
                          {renamingId === item.id ? (
                            <RenameInput item={item} onDone={(name) => commitRename(item, name)} />
                          ) : (
                            <p className='flex items-center gap-1 text-sm font-medium' title={item.name}>
                              <span className='truncate'>{item.name}</span>
                              {item.starred && <StarIcon className='size-3.5 shrink-0 fill-amber-400 text-amber-400' aria-label='Starred' />}
                              {item.shared && <LinkIcon className='size-3.5 shrink-0 text-muted-foreground' aria-label='Shared' />}
                            </p>
                          )}
                          <p className='truncate text-xs text-muted-foreground'>
                            {item.type === 'file' ? formatBytes(item.size) : 'Folder'}
                            {showLocation && item.location ? ` · ${item.location.path}` : ''}
                          </p>
                        </div>
                        <RowMenu entries={menuFor([item])} name={item.name} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {dragging && (
              <div className='pointer-events-none absolute inset-x-2 inset-y-0 z-20 flex items-start justify-center rounded-xl border-2 border-dashed border-primary bg-selection/70 pt-24 sm:inset-x-6'>
                <div className='flex flex-col items-center gap-2 rounded-xl bg-background px-6 py-4 text-center shadow-lg'>
                  <UploadCloudIcon className='size-8 text-primary' />
                  <p className='font-medium'>{dropLabel ?? 'Drop to upload'}</p>
                </div>
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        {menuItems.length > 0 && (
          <ContextMenuContent className='w-52'>
            {menuItems.map((entry) => (
              <MenuRow key={entry.key} entry={entry} kind='context' />
            ))}
          </ContextMenuContent>
        )}
      </ContextMenu>
    </div>
  );
}

function StarToggle({ item, coarse }: { item: Item; coarse: boolean }) {
  const actions = useFileActions();
  if (coarse && !item.starred)
    return null;
  return (
    <button
      type='button'
      aria-label={item.starred ? `Unstar ${item.name}` : `Star ${item.name}`}
      aria-pressed={item.starred}
      className={cn(
        'shrink-0 rounded p-0.5 hover:bg-accent',
        item.starred ? 'text-amber-400' : 'text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      )}
      onClick={(e) => {
        e.stopPropagation();
        actions.star([item], !item.starred);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <StarIcon className={cn('size-4', item.starred && 'fill-current')} />
    </button>
  );
}

function MenuRow({ entry, kind }: { entry: MenuEntry; kind: 'context' | 'dropdown' }) {
  const Item = kind === 'context' ? ContextMenuItem : DropdownMenuItem;
  const Separator = kind === 'context' ? ContextMenuSeparator : DropdownMenuSeparator;
  return (
    <>
      {entry.separatorBefore && <Separator />}
      <Item
        variant={entry.destructive ? 'destructive' : 'default'}
        onSelect={entry.onSelect}
      >
        <entry.icon />
        {entry.label}
      </Item>
    </>
  );
}

function RowMenu({ entries, name }: { entries: MenuEntry[]; name: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={`Actions for ${name}`}
          className='text-muted-foreground hover:bg-accent aria-expanded:bg-accent'
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-48' onClick={(e) => e.stopPropagation()}>
        {entries.map((entry) => (
          <MenuRow key={entry.key} entry={entry} kind='dropdown' />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectionBar({
  count,
  entries,
  onClear
}: {
  count: number;
  entries: MenuEntry[];
  onClear: () => void;
}) {
  return (
    <div className='flex min-w-0 flex-1 items-center gap-1.5' role='toolbar' aria-label='Selection actions'>
      <div className='flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto'>
        {entries.map((entry, i) => (
          <Button
            key={entry.key}
            variant={i === 0 ? 'default' : 'outline'}
            size='sm'
            onClick={entry.onSelect}
            className={cn('shrink-0', entry.destructive && 'text-destructive hover:text-destructive')}
            aria-label={entry.label}
          >
            <entry.icon />
            <span className='max-md:sr-only'>{entry.label}</span>
          </Button>
        ))}
      </div>
      <span className='ml-2 shrink-0 text-sm text-muted-foreground'>{count} selected</span>
      <Button variant='ghost' size='icon-sm' onClick={onClear} aria-label='Clear selection'>
        <XIcon />
      </Button>
    </div>
  );
}

function RenameInput({ item, onDone }: { item: Item; onDone: (name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = item.type === 'file' ? item.name.lastIndexOf('.') : -1;
    input.setSelectionRange(0, dot > 0 ? dot : item.name.length);
  }, [item]);
  const finish = (name: string) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
    // Allow another attempt if the rename failed and the input stays.
    setTimeout(() => (done.current = false), 0);
  };
  return (
    <input
      ref={ref}
      defaultValue={item.name}
      aria-label='New name'
      className='h-8 w-full rounded-md border border-primary bg-background px-2 text-sm outline-none ring-3 ring-primary/15'
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value);
        if (e.key === 'Escape') finish(item.name);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}

function LoadingRows() {
  return (
    <div className='px-4 sm:px-8' aria-busy='true' aria-label='Loading'>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className='flex h-14 items-center gap-3 border-b px-2'>
          <Skeleton className='size-9 rounded-md' />
          <Skeleton className='h-4 max-w-72 flex-1' />
          <Skeleton className='ml-auto h-4 w-20 max-md:hidden' />
        </div>
      ))}
    </div>
  );
}
