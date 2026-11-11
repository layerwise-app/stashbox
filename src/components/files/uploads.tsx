import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  XIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Progress } from '~/components/ui/progress';
import { FileIcon } from '~/components/files/file-icon';
import { errorMessage, fileKeys, useRefreshFiles } from '~/components/files/queries';
import { formatBytes, guessMimeType } from '~/lib/files';
import {
  cancelUpload,
  createFolderTree,
  finishUpload,
  getStorageInfo,
  startUpload
} from '~/server/files.functions';
import { cn } from '~/lib/utils';

export type PickedFile = { file: File; path: string };

type Status = 'queued' | 'uploading' | 'finishing' | 'done' | 'error' | 'canceled';

type Task = {
  id: string;
  file: File;
  name: string;
  parentId: string | null;
  loaded: number;
  status: Status;
  error?: string;
};

type UploadContextValue = {
  /** Uploads files; `path` keeps folder structure ("Photos/2024/a.jpg"). */
  upload: (parentId: string | null, files: PickedFile[], emptyDirs?: string[]) => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function useUploads() {
  const value = useContext(UploadContext);
  if (!value) throw new Error('useUploads needs an UploadProvider');
  return value;
}

const CONCURRENCY = 3;

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (loaded: number) => void,
  signal: { xhr?: XMLHttpRequest }
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhr = xhr;
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) {
      if (!['content-length', 'host'].includes(name.toLowerCase()))
        xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`The upload failed (error ${xhr.status}). Try again.`));
    xhr.onerror = () =>
      reject(new Error('The upload failed. Check your connection and try again.'));
    xhr.onabort = () => reject(new DOMException('Canceled', 'AbortError'));
    xhr.send(file);
  });
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const refresh = useRefreshFiles();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const controls = useRef(new Map<string, { xhr?: XMLHttpRequest; uploadId?: string; canceled?: boolean }>());
  const queue = useRef<Task[]>([]);
  const active = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 300);
  }, [refresh]);

  const run = useCallback(async (task: Task) => {
    const control = controls.current.get(task.id) ?? {};
    controls.current.set(task.id, control);
    update(task.id, { status: 'uploading' });
    try {
      const started = await startUpload({
        data: {
          parentId: task.parentId,
          name: task.name,
          size: task.file.size,
          type: guessMimeType(task.name, task.file.type)
        }
      });
      if (!started.done) {
        control.uploadId = started.id;
        if (control.canceled) throw new DOMException('Canceled', 'AbortError');
        await putWithProgress(started.url, started.headers, task.file, (loaded) =>
          update(task.id, { loaded }), control);
        update(task.id, { status: 'finishing', loaded: task.file.size });
        await finishUpload({ data: { id: started.id } });
      }
      update(task.id, { status: 'done', loaded: task.file.size });
    } catch (error) {
      if (control.canceled || (error instanceof DOMException && error.name === 'AbortError')) {
        update(task.id, { status: 'canceled' });
      } else {
        update(task.id, { status: 'error', error: errorMessage(error) });
      }
      // Release the space reserved for this upload.
      if (control.uploadId) cancelUpload({ data: { id: control.uploadId } }).catch(() => {});
    } finally {
      controls.current.delete(task.id);
      scheduleRefresh();
    }
  }, [scheduleRefresh, update]);

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const task = queue.current.shift()!;
      if (controls.current.get(task.id)?.canceled) continue;
      active.current++;
      run(task).finally(() => {
        active.current--;
        pump();
      });
    }
  }, [run]);

  const upload = useCallback<UploadContextValue['upload']>(
    async (parentId, files, emptyDirs = []) => {
      if (!files.length && !emptyDirs.length) return;
      setCollapsed(false);

      // Folders first, so each file knows where it goes.
      const dirs = new Set(emptyDirs);
      for (const { path } of files) {
        const parts = path.split('/').slice(0, -1);
        for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
      let folderIds: Record<string, string> = {};
      if (dirs.size) {
        try {
          folderIds = await createFolderTree({ data: { parentId, paths: [...dirs] } });
          scheduleRefresh();
        } catch (error) {
          toast.error(`Couldn’t create folders: ${errorMessage(error)}`);
          return;
        }
      }

      // Check each file against the limits before sending anything.
      const info = await queryClient
        .fetchQuery({ queryKey: fileKeys.storage, queryFn: () => getStorageInfo(), staleTime: 0 })
        .catch(() => null);
      let planned = info?.usedBytes ?? 0;
      const created: Task[] = files.map(({ file, path }) => {
        const dir = path.split('/').slice(0, -1).join('/');
        const task: Task = {
          id: crypto.randomUUID(),
          file,
          name: file.name,
          parentId: dir ? folderIds[dir] ?? parentId : parentId,
          loaded: 0,
          status: 'queued'
        };
        if (info && file.size > info.maxFileBytes) {
          task.status = 'error';
          task.error = `Too large (${formatBytes(file.size)}). Files can be up to ${formatBytes(info.maxFileBytes)}.`;
        } else if (info?.storageFull) {
          task.status = 'error';
          task.error = 'Stashbox storage is full right now. Try again later.';
        } else if (info && planned + file.size > info.limitBytes) {
          task.status = 'error';
          task.error = `Not enough space. You have ${formatBytes(Math.max(0, info.limitBytes - planned))} left on your ${info.planName}.`;
        } else {
          planned += file.size;
        }
        return task;
      });
      setTasks((list) => [
        ...list.filter((t) => !['done', 'canceled'].includes(t.status)),
        ...created
      ]);
      queue.current.push(...created.filter((t) => t.status === 'queued'));
      pump();
    },
    [pump, queryClient, scheduleRefresh]
  );

  const cancel = useCallback((id: string) => {
    const control = controls.current.get(id);
    if (control) {
      control.canceled = true;
      control.xhr?.abort();
    } else {
      queue.current = queue.current.filter((t) => t.id !== id);
      update(id, { status: 'canceled' });
    }
  }, [update]);

  const value = useMemo(() => ({ upload }), [upload]);

  // Warn before leaving while uploads run.
  const busy = tasks.some((t) => ['queued', 'uploading', 'finishing'].includes(t.status));
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  return (
    <UploadContext.Provider value={value}>
      {children}
      {tasks.length > 0 && (
        <UploadPanel
          tasks={tasks}
          busy={busy}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onCancel={cancel}
          onCancelAll={() => tasks.forEach((t) => cancel(t.id))}
          onClose={() => setTasks([])}
        />
      )}
    </UploadContext.Provider>
  );
}

function UploadPanel({
  tasks,
  busy,
  collapsed,
  onToggle,
  onCancel,
  onCancelAll,
  onClose
}: {
  tasks: Task[];
  busy: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onCancel: (id: string) => void;
  onCancelAll: () => void;
  onClose: () => void;
}) {
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'error').length;
  const pending = tasks.filter((t) => ['queued', 'uploading', 'finishing'].includes(t.status));
  const total = pending.reduce((sum, t) => sum + t.file.size, 0);
  const loaded = pending.reduce((sum, t) => sum + t.loaded, 0);
  const title = busy
    ? `Uploading ${pending.length} ${pending.length === 1 ? 'file' : 'files'}…`
    : failed
      ? `${done} uploaded, ${failed} failed`
      : `${done} ${done === 1 ? 'upload' : 'uploads'} complete`;

  return (
    <section
      aria-label='Uploads'
      className='fixed right-4 bottom-4 z-40 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl'
    >
      <header className='flex items-center gap-2 border-b px-4 py-3'>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-sm font-medium'>{title}</p>
          {busy && total > 0 && (
            <Progress value={(loaded / total) * 100} className='mt-2 h-1' />
          )}
        </div>
        <Button variant='ghost' size='icon-sm' onClick={onToggle} aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}>
          {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
        {busy ? (
          <Button variant='ghost' size='sm' onClick={onCancelAll}>
            Cancel all
          </Button>
        ) : (
          <Button variant='ghost' size='icon-sm' onClick={onClose} aria-label='Close uploads'>
            <XIcon />
          </Button>
        )}
      </header>
      {!collapsed && (
        <ul className='max-h-72 overflow-y-auto py-1'>
          {tasks.map((task) => (
            <li key={task.id} className='flex items-center gap-3 px-4 py-2'>
              <FileIcon item={{ type: 'file', name: task.name, mimeType: task.file.type }} className='size-5' />
              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm'>{task.name}</p>
                {task.status === 'uploading' || task.status === 'finishing' ? (
                  <Progress value={task.file.size ? (task.loaded / task.file.size) * 100 : 100} className='mt-1.5 h-1' />
                ) : (
                  <p className={cn('text-xs', task.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                    {task.status === 'queued' && `Waiting · ${formatBytes(task.file.size)}`}
                    {task.status === 'done' && formatBytes(task.file.size)}
                    {task.status === 'canceled' && 'Canceled'}
                    {task.status === 'error' && task.error}
                  </p>
                )}
              </div>
              {task.status === 'done' && <CheckCircle2Icon className='size-4 text-emerald-600' aria-label='Uploaded' />}
              {task.status === 'error' && <CircleAlertIcon className='size-4 text-destructive' aria-label='Failed' />}
              {['queued', 'uploading'].includes(task.status) && (
                <Button variant='ghost' size='icon-xs' onClick={() => onCancel(task.id)} aria-label={`Cancel ${task.name}`}>
                  <XIcon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- Reading dropped files and folders -----------------------------------

function readAll(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

function entryFile(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

/** Files and empty folders from a drop, keeping folder paths. */
export async function filesFromDrop(dataTransfer: DataTransfer) {
  const files: PickedFile[] = [];
  const emptyDirs: string[] = [];
  const entries = [...dataTransfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);

  if (entries.every((e) => e === null)) {
    for (const file of dataTransfer.files) files.push({ file, path: file.name });
    return { files, emptyDirs };
  }

  async function walk(entry: FileSystemEntry, prefix: string) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      files.push({ file: await entryFile(entry as FileSystemFileEntry), path });
    } else if (entry.isDirectory) {
      const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
      if (!children.length) emptyDirs.push(path);
      for (const child of children) await walk(child, path);
    }
  }
  for (const entry of entries) if (entry) await walk(entry, '');
  return { files, emptyDirs };
}

/** Files from an <input type=file>, with folder paths for folder pickers. */
export function filesFromInput(list: FileList): PickedFile[] {
  return [...list].map((file) => ({
    file,
    path: file.webkitRelativePath || file.name
  }));
}
