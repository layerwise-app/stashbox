import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStorageInfo } from '~/server/files.functions';

export const fileKeys = {
  all: ['files'] as const,
  folder: (id: string | null) => ['files', 'folder', id ?? 'root'] as const,
  folders: (id: string | null) => ['files', 'folders', id ?? 'root'] as const,
  starred: ['files', 'starred'] as const,
  recent: ['files', 'recent'] as const,
  search: (q: string) => ['files', 'search', q] as const,
  trash: ['files', 'trash'] as const,
  shares: ['files', 'shares'] as const,
  storage: ['files', 'storage'] as const
};

/** Refetches every file list, the storage meter, and share links. */
export function useRefreshFiles() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: fileKeys.all }),
    [queryClient]
  );
}

export function useStorageInfo() {
  return useQuery({
    queryKey: fileKeys.storage,
    queryFn: () => getStorageInfo()
  });
}

/** State saved in localStorage, read after hydration. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      // Ignore unreadable values.
    }
  }, [key]);
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode can refuse writes.
      }
    },
    [key]
  );
  return [value, set] as const;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Starts a browser download without leaving the page. */
export function startDownload(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
