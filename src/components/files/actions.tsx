import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CreateDialog, type CreateRequest } from '~/components/files/create-dialogs';
import { FolderPickerDialog, type PickerRequest } from '~/components/files/folder-picker';
import { FilePreview, type PreviewSource } from '~/components/files/preview';
import { errorMessage, startDownload, useRefreshFiles } from '~/components/files/queries';
import { ShareDialog, type ShareTarget } from '~/components/files/share-dialog';
import type { Item } from '~/lib/files';
import {
  copyItems,
  getFileText,
  getFileUrl,
  markOpened,
  moveItems,
  putBack,
  restoreItems,
  setStarred,
  trashItems
} from '~/server/files.functions';

type FileActions = {
  openPreview: (files: Item[], index: number) => void;
  share: (item: ShareTarget) => void;
  moveOrCopy: (mode: 'move' | 'copy', items: Item[], startFolderId: string | null) => void;
  download: (items: Item[]) => void;
  trash: (items: Item[]) => Promise<void>;
  star: (items: Item[], starred: boolean) => Promise<void>;
  create: (kind: 'folder' | 'text', parentId: string | null) => void;
};

const FileActionsContext = createContext<FileActions | null>(null);

export function useFileActions() {
  const value = useContext(FileActionsContext);
  if (!value) throw new Error('useFileActions needs a FileActionsProvider');
  return value;
}

function describe(items: { name: string }[]) {
  return items.length === 1 ? `“${items[0].name}”` : `${items.length} items`;
}

export function FileActionsProvider({ children }: { children: ReactNode }) {
  const refresh = useRefreshFiles();
  const [preview, setPreview] = useState<{ files: Item[]; index: number } | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null);

  const download = useCallback((items: Item[]) => {
    if (items.length === 1 && items[0].type === 'file') {
      getFileUrl({ data: { id: items[0].id, download: true } })
        .then(startDownload)
        .catch((error) => toast.error(errorMessage(error)));
      return;
    }
    const name = items.length === 1 ? items[0].name : `Stashbox (${items.length} items)`;
    const params = new URLSearchParams({ ids: items.map((i) => i.id).join(','), name });
    startDownload(`/api/zip?${params}`);
    toast.success(`Preparing ${name}.zip`);
  }, []);

  const trash = useCallback(async (items: Item[]) => {
    try {
      const { ids } = await trashItems({ data: { ids: items.map((i) => i.id) } });
      await refresh();
      toast.success(`Moved ${describe(items)} to Trash`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await restoreItems({ data: { ids } });
              await refresh();
              toast.success(`Restored ${describe(items)}`);
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }
        }
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [refresh]);

  const star = useCallback(async (items: Item[], starred: boolean) => {
    try {
      await setStarred({ data: { ids: items.map((i) => i.id), starred } });
      await refresh();
      toast.success(`${starred ? 'Starred' : 'Unstarred'} ${describe(items)}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [refresh]);

  const pickDestination = useCallback(async (targetId: string | null) => {
    if (!picker) return;
    const ids = picker.items.map((i) => i.id);
    const what = describe(picker.items);
    if (picker.mode === 'copy') {
      await copyItems({ data: { ids, targetId } });
      await refresh();
      setPicker(null);
      toast.success(`Copied ${what}`);
      return;
    }
    const { previous } = await moveItems({ data: { ids, targetId } });
    await refresh();
    setPicker(null);
    toast.success(`Moved ${what}`, {
      action: previous.length
        ? {
            label: 'Undo',
            onClick: async () => {
              try {
                await putBack({ data: { entries: previous } });
                await refresh();
                toast.success('Move undone');
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }
          }
        : undefined
    });
  }, [picker, refresh]);

  const actions = useMemo<FileActions>(() => ({
    openPreview: (files, index) => {
      setPreview({ files, index });
      markOpened({ data: { id: files[index].id } }).catch(() => {});
    },
    share: setShareTarget,
    moveOrCopy: (mode, items, startFolderId) => setPicker({ mode, items, startFolderId }),
    download,
    trash,
    star,
    create: (kind, parentId) => setCreateRequest({ kind, parentId })
  }), [download, trash, star]);

  const source = useMemo<PreviewSource>(() => ({
    key: 'owner',
    url: (file) => getFileUrl({ data: { id: file.id } }),
    text: (file) => getFileText({ data: { id: file.id } }),
    download: (file) => {
      const item = preview?.files.find((f) => f.id === file.id);
      if (item) download([item]);
    },
    share: (file) => {
      const item = preview?.files.find((f) => f.id === file.id);
      if (item) setShareTarget(item);
    }
  }), [download, preview]);

  return (
    <FileActionsContext.Provider value={actions}>
      {children}
      {preview && (
        <FilePreview
          files={preview.files}
          index={preview.index}
          source={source}
          onIndexChange={(index) => {
            setPreview({ ...preview, index });
            markOpened({ data: { id: preview.files[index].id } }).catch(() => {});
          }}
          onClose={() => {
            setPreview(null);
            refresh();
          }}
        />
      )}
      <ShareDialog target={shareTarget} onOpenChange={(open) => !open && setShareTarget(null)} />
      <FolderPickerDialog
        request={picker}
        onOpenChange={(open) => !open && setPicker(null)}
        onPick={pickDestination}
      />
      <CreateDialog request={createRequest} onOpenChange={(open) => !open && setCreateRequest(null)} />
    </FileActionsContext.Provider>
  );
}
