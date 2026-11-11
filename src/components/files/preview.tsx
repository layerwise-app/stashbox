import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Share2Icon,
  XIcon
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { FileIcon } from '~/components/files/file-icon';
import { Markdown } from '~/components/files/markdown';
import { errorMessage } from '~/components/files/queries';
import { fileKind, formatBytes, formatDate, isMarkdown, type Item } from '~/lib/files';

export type PreviewFile = Pick<Item, 'id' | 'name' | 'size' | 'mimeType' | 'updatedAt'>;

/** Where a preview reads its file from: the owner's files or a share link. */
export type PreviewSource = {
  key: string;
  url: (file: PreviewFile) => Promise<string>;
  text: (file: PreviewFile) => Promise<{ text: string; truncated: boolean }>;
  download?: (file: PreviewFile) => void;
  share?: (file: PreviewFile) => void;
};

export function FilePreview({
  files,
  index,
  onIndexChange,
  onClose,
  source
}: {
  files: PreviewFile[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose?: () => void;
  source: PreviewSource;
}) {
  const file = files[index];
  const hasPrev = index > 0;
  const hasNext = index < files.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Leave keys alone while a dialog (like Share) is open on top.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      if (event.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
      else if (event.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
      else if (event.key === 'Escape' && onClose) onClose();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndexChange, onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (!file) return null;

  return (
    <div
      role='region'
      aria-label={`Preview of ${file.name}`}
      data-preview
      className='fixed inset-0 z-50 flex flex-col bg-background'
    >
      <header className='flex h-16 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-5'>
        <FileIcon item={{ type: 'file', name: file.name, mimeType: file.mimeType }} className='size-8' />
        <div className='min-w-0 flex-1'>
          <h2 className='truncate text-[15px] font-semibold'>{file.name}</h2>
          <p className='truncate text-xs text-muted-foreground'>
            {formatBytes(file.size)} · Modified {formatDate(file.updatedAt)}
            {files.length > 1 && ` · ${index + 1} of ${files.length}`}
          </p>
        </div>
        {source.download && (
          <Button variant='outline' onClick={() => source.download!(file)}>
            <DownloadIcon />
            <span className='max-sm:sr-only'>Download</span>
          </Button>
        )}
        {source.share && (
          <Button onClick={() => source.share!(file)}>
            <Share2Icon />
            <span className='max-sm:sr-only'>Share</span>
          </Button>
        )}
        {onClose && (
          <Button variant='ghost' size='icon' onClick={onClose} aria-label='Close preview'>
            <XIcon />
          </Button>
        )}
      </header>
      <div className='relative flex min-h-0 flex-1 items-center justify-center bg-muted'>
        <PreviewBody key={file.id} file={file} source={source} />
        {hasPrev && (
          <Button
            variant='secondary'
            size='icon-lg'
            className='absolute top-1/2 left-3 -translate-y-1/2 rounded-full shadow-md'
            onClick={() => onIndexChange(index - 1)}
            aria-label='Previous file'
          >
            <ChevronLeftIcon />
          </Button>
        )}
        {hasNext && (
          <Button
            variant='secondary'
            size='icon-lg'
            className='absolute top-1/2 right-3 -translate-y-1/2 rounded-full shadow-md'
            onClick={() => onIndexChange(index + 1)}
            aria-label='Next file'
          >
            <ChevronRightIcon />
          </Button>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className='flex flex-col items-center gap-4 p-6 text-center'>{children}</div>;
}

function PreviewBody({ file, source }: { file: PreviewFile; source: PreviewSource }) {
  const kind = fileKind(file.name, file.mimeType);
  const needsUrl = ['image', 'video', 'audio', 'pdf'].includes(kind);
  const url = useQuery({
    queryKey: ['preview-url', source.key, file.id],
    queryFn: () => source.url(file),
    enabled: needsUrl,
    staleTime: 10 * 60 * 1000
  });
  const text = useQuery({
    queryKey: ['preview-text', source.key, file.id],
    queryFn: () => source.text(file),
    enabled: kind === 'text',
    staleTime: 60 * 1000
  });

  const failed = url.error ?? text.error;
  if (failed)
    return (
      <Centered>
        <p className='text-sm text-destructive'>{errorMessage(failed)}</p>
      </Centered>
    );
  if ((needsUrl && !url.data) || (kind === 'text' && !text.data))
    return (
      <Centered>
        <Spinner className='size-6' />
      </Centered>
    );

  switch (kind) {
    case 'image':
      return (
        <img
          src={url.data}
          alt={file.name}
          className='max-h-full max-w-full object-contain p-4 sm:p-8'
        />
      );
    case 'video':
      return (
        <video src={url.data} controls autoPlay playsInline className='max-h-full max-w-full bg-black'>
          <track kind='captions' />
        </video>
      );
    case 'audio':
      return (
        <Centered>
          <FileIcon item={{ type: 'file', name: file.name, mimeType: file.mimeType }} className='size-24' />
          <audio src={url.data} controls autoPlay className='w-[min(480px,90vw)]' />
        </Centered>
      );
    case 'pdf':
      return <iframe src={url.data} title={file.name} className='size-full border-0 bg-white' />;
    case 'text':
      return (
        <div className='size-full overflow-auto'>
          <div className='mx-auto max-w-4xl p-4 sm:p-8'>
            {isMarkdown(file.name) ? (
              <article className='rounded-xl border bg-card p-6 sm:p-10'>
                <Markdown source={text.data!.text} />
              </article>
            ) : (
              <pre className='overflow-x-auto rounded-xl border bg-card p-4 font-mono text-[13px] leading-6 whitespace-pre sm:p-6'>
                {text.data!.text || ' '}
              </pre>
            )}
            {text.data!.truncated && (
              <p className='mt-3 text-center text-xs text-muted-foreground'>
                Showing the first 1 MB. Download the file to see all of it.
              </p>
            )}
          </div>
        </div>
      );
    default:
      return (
        <Centered>
          <FileIcon item={{ type: 'file', name: file.name, mimeType: file.mimeType }} className='size-28 stroke-1' />
          <div>
            <p className='font-medium'>{file.name}</p>
            <p className='text-sm text-muted-foreground'>No preview available for this file type.</p>
          </div>
          {source.download && (
            <Button onClick={() => source.download!(file)}>
              <DownloadIcon />
              Download
            </Button>
          )}
        </Centered>
      );
  }
}
