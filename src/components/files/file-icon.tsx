import {
  ArchiveIcon,
  CodeIcon,
  FileTextIcon,
  ImageIcon,
  Music2Icon,
  PlayIcon,
  Sheet as SheetIcon,
  TextIcon
} from 'lucide-react';
import { cn } from '~/lib/utils';
import { extensionOf, fileKind, type FileKind } from '~/lib/files';

const KIND_STYLE: Record<FileKind, { glyph: typeof ImageIcon; color: string }> = {
  image: { glyph: ImageIcon, color: 'text-violet-600 dark:text-violet-400' },
  video: { glyph: PlayIcon, color: 'text-rose-600 dark:text-rose-400' },
  audio: { glyph: Music2Icon, color: 'text-amber-600 dark:text-amber-400' },
  pdf: { glyph: FileTextIcon, color: 'text-red-600 dark:text-red-400' },
  text: { glyph: TextIcon, color: 'text-stone-500 dark:text-stone-400' },
  archive: { glyph: ArchiveIcon, color: 'text-yellow-700 dark:text-yellow-500' },
  spreadsheet: { glyph: SheetIcon, color: 'text-emerald-600 dark:text-emerald-400' },
  document: { glyph: TextIcon, color: 'text-blue-600 dark:text-blue-400' },
  other: { glyph: FileTextIcon, color: 'text-stone-400' }
};

const CODE_EXTENSIONS = new Set([
  'js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html', 'py', 'rb', 'go', 'rs',
  'java', 'c', 'cpp', 'h', 'sh', 'sql', 'yml', 'yaml', 'toml', 'xml', 'php'
]);

/** A folder or a page with a colored mark for its type. Size it with `size-*`. */
export function FileIcon({
  item,
  className
}: {
  item: { type: 'file' | 'folder'; name: string; mimeType?: string | null };
  className?: string;
}) {
  if (item.type === 'folder')
    return (
      <svg viewBox='0 0 40 40' className={cn('shrink-0', className)} aria-hidden>
        <path
          d='M4 10.5A3.5 3.5 0 0 1 7.5 7h8.1c.9 0 1.8.4 2.4 1l2.2 2.2c.4.4.9.6 1.4.6H32.5a3.5 3.5 0 0 1 3.5 3.5V30a3.5 3.5 0 0 1-3.5 3.5h-25A3.5 3.5 0 0 1 4 30z'
          className='fill-[#5b8def] dark:fill-[#3f6fcf]'
        />
        <path
          d='M4 16.5A2.5 2.5 0 0 1 6.5 14h27a2.5 2.5 0 0 1 2.5 2.5V30a3.5 3.5 0 0 1-3.5 3.5h-25A3.5 3.5 0 0 1 4 30z'
          className='fill-[#8eb7ff] dark:fill-[#5b8def]'
        />
      </svg>
    );

  const kind = fileKind(item.name, item.mimeType);
  const style = KIND_STYLE[kind];
  const Glyph = kind === 'text' && CODE_EXTENSIONS.has(extensionOf(item.name)) ? CodeIcon : style.glyph;
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} aria-hidden>
      <svg viewBox='0 0 40 40' className='absolute inset-0 size-full'>
        <path
          d='M10 3.5h14.2c.5 0 1 .2 1.4.6l7.8 7.8c.4.4.6.9.6 1.4V34.5a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-29a2 2 0 0 1 2-2z'
          className='fill-white stroke-[#d4cec7] dark:fill-[#2a2826] dark:stroke-[#4a4642]'
          strokeWidth='1.2'
        />
        <path d='M24.5 3.8V10a2.5 2.5 0 0 0 2.5 2.5h6.2' fill='none' className='stroke-[#d4cec7] dark:stroke-[#4a4642]' strokeWidth='1.2' />
      </svg>
      <Glyph className={cn('relative mt-[18%] size-[42%] stroke-[2.25]', style.color, kind === 'video' && 'fill-current')} />
    </span>
  );
}
