import { useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePlusIcon,
  FolderPlusIcon,
  FolderUpIcon,
  PlusIcon,
  UploadCloudIcon,
  UploadIcon
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '~/components/ui/empty';
import { useFileActions } from '~/components/files/actions';
import { ItemBrowser, type MenuEntry } from '~/components/files/item-browser';
import { fileKeys } from '~/components/files/queries';
import { filesFromDrop, filesFromInput, useUploads, type PickedFile } from '~/components/files/uploads';
import type { Crumb } from '~/lib/files';
import { listFolder } from '~/server/files.functions';

const JUNK = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const withoutJunk = (files: PickedFile[]) => files.filter(({ file }) => !JUNK.has(file.name));

export function FolderView({ folderId }: { folderId: string | null }) {
  const actions = useFileActions();
  const { upload } = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const query = useQuery({
    queryKey: fileKeys.folder(folderId),
    queryFn: () => listFolder({ data: { folderId } })
  });

  const folderName = query.data?.folder?.name ?? 'All files';
  const backgroundMenu: MenuEntry[] = [
    { key: 'new-folder', label: 'New folder', icon: FolderPlusIcon, onSelect: () => actions.create('folder', folderId) },
    { key: 'new-text', label: 'New text file', icon: FilePlusIcon, onSelect: () => actions.create('text', folderId) },
    { key: 'upload-files', label: 'Upload files', icon: UploadIcon, onSelect: () => fileInput.current?.click(), separatorBefore: true },
    { key: 'upload-folder', label: 'Upload folder', icon: FolderUpIcon, onSelect: () => folderInput.current?.click() }
  ];

  return (
    <>
      <input
        ref={fileInput}
        type='file'
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(folderId, withoutJunk(filesFromInput(e.target.files)));
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type='file'
        hidden
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          if (e.target.files) upload(folderId, withoutJunk(filesFromInput(e.target.files)));
          e.target.value = '';
        }}
      />
      <ItemBrowser
        key={folderId ?? 'root'}
        items={query.data?.items}
        isLoading={query.isLoading}
        error={query.error}
        folderId={folderId}
        title={<Breadcrumbs crumbs={query.data?.crumbs ?? [{ id: null, name: 'All files' }]} />}
        toolbar={
          <div className='flex items-center gap-2'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <UploadIcon />
                  <span className='max-sm:sr-only'>Upload</span>
                  <ChevronDownIcon className='max-sm:hidden' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className='w-44'>
                <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                  <UploadIcon /> Files
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => folderInput.current?.click()}>
                  <FolderUpIcon /> Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline'>
                  <PlusIcon />
                  <span className='max-sm:sr-only'>Create</span>
                  <ChevronDownIcon className='max-sm:hidden' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' className='w-44'>
                <DropdownMenuItem onSelect={() => actions.create('folder', folderId)}>
                  <FolderPlusIcon /> Folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => actions.create('text', folderId)}>
                  <FilePlusIcon /> Text file
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
        backgroundMenu={backgroundMenu}
        dropLabel={`Drop to upload to ${folderName}`}
        onDropFiles={async (dataTransfer) => {
          const { files, emptyDirs } = await filesFromDrop(dataTransfer);
          upload(folderId, withoutJunk(files), emptyDirs);
        }}
        empty={
          query.error ? null : (
            <Empty className='w-full max-w-2xl rounded-xl border-2 border-dashed py-14'>
              <EmptyHeader>
                <EmptyMedia>
                  <UploadCloudIcon className='size-12 text-primary' strokeWidth={1.5} />
                </EmptyMedia>
                <EmptyTitle>Drop files here to upload</EmptyTitle>
                <EmptyDescription>
                  Or use the Upload button. Files and folders stay private until you share them.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className='flex-row justify-center'>
                <Button onClick={() => fileInput.current?.click()}>
                  <UploadIcon /> Upload files
                </Button>
                <Button variant='outline' onClick={() => actions.create('folder', folderId)}>
                  <FolderPlusIcon /> Create folder
                </Button>
              </EmptyContent>
            </Empty>
          )
        }
      />
    </>
  );
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  // On narrow screens only the last two levels fit.
  return (
    <nav aria-label='Folder path'>
      <ol className='-ml-1 flex min-w-0 items-center gap-0.5 text-xl sm:text-2xl'>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const hiddenOnMobile = i < crumbs.length - 2;
          return (
            <li key={crumb.id ?? 'root'} className={`flex min-w-0 items-center gap-0.5 ${hiddenOnMobile ? 'max-sm:hidden' : ''}`}>
              {i > 0 && <ChevronRightIcon className='size-5 shrink-0 text-muted-foreground' aria-hidden />}
              {last ? (
                <h1 className='truncate px-1 font-semibold tracking-tight' aria-current='page'>
                  {crumb.name}
                </h1>
              ) : (
                <Link
                  to={crumb.id ? '/dashboard/folder/$folderId' : '/dashboard'}
                  params={crumb.id ? { folderId: crumb.id } : undefined}
                  className='truncate rounded-md px-1 text-muted-foreground hover:bg-muted hover:text-foreground'
                >
                  {crumb.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return <h1 className='truncate text-xl font-semibold tracking-tight sm:text-2xl'>{children}</h1>;
}
