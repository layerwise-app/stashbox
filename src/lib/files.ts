// Shared by the browser and server: item shapes, file kinds, and formatting.

/** Storage each user gets on the Free plan. */
export const PLAN_NAME = 'Free plan';
export const PLAN_LIMIT_BYTES = 2 * 1024 ** 3;

export type ItemType = 'file' | 'folder';

export type Item = {
  id: string;
  parentId: string | null;
  type: ItemType;
  name: string;
  size: number;
  mimeType: string | null;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Folder path, set on lists that mix folders (search, starred, recent). */
  location?: { id: string | null; path: string };
  /** Present when the item has an active share link. */
  shared?: boolean;
  /** The nearest folder above the item with a share link, if any. */
  sharedVia?: { id: string; name: string };
};

export type Crumb = { id: string | null; name: string };

export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'text'
  | 'archive'
  | 'spreadsheet'
  | 'document'
  | 'other';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
  'css', 'scss', 'html', 'htm', 'xml', 'svg', 'py', 'rb', 'go', 'rs', 'java',
  'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'csv', 'tsv', 'log',
  'sql', 'graphql', 'vue', 'svelte', 'lua', 'r', 'dart', 'gitignore'
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  svg: 'image/svg+xml', ico: 'image/x-icon', heic: 'image/heic',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  ogv: 'video/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus',
  pdf: 'application/pdf', zip: 'application/zip', json: 'application/json',
  md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain',
  csv: 'text/csv', html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', mjs: 'text/javascript', xml: 'application/xml'
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The browser's type, or a guess from the extension. */
export function guessMimeType(name: string, browserType?: string): string {
  if (browserType) return browserType;
  return MIME_BY_EXTENSION[extensionOf(name)] ?? 'application/octet-stream';
}

export function fileKind(name: string, mimeType?: string | null): FileKind {
  const ext = extensionOf(name);
  const mime = mimeType ?? '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'svg') return 'image';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/')) return 'text';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(ext))
    return 'archive';
  if (['xls', 'xlsx', 'numbers', 'ods'].includes(ext)) return 'spreadsheet';
  if (['doc', 'docx', 'pages', 'odt', 'rtf', 'ppt', 'pptx', 'key'].includes(ext))
    return 'document';
  const guessed = MIME_BY_EXTENSION[ext];
  if (guessed && guessed !== mime) return fileKind('', guessed);
  return 'other';
}

export function isMarkdown(name: string): boolean {
  return ['md', 'markdown'].includes(extensionOf(name));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const sameYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});
const otherYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

export function formatDate(value: Date | string | number): string {
  const date = new Date(value);
  return date.getFullYear() === new Date().getFullYear()
    ? sameYear.format(date)
    : otherYear.format(date);
}

/** "report.pdf" → "report (1).pdf" style names that are not in `taken`. */
export function uniqueName(name: string, taken: Iterable<string>, isFolder = false) {
  const lower = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  const dot = isFolder ? -1 : name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/** Trims a user-entered name and rejects ones that can't be used. */
export function cleanName(raw: string): string {
  const name = raw.trim().replace(/[\u0000-\u001f]/g, '');
  if (!name) throw new Error('Enter a name.');
  if (name.includes('/')) throw new Error('Names can’t contain “/”.');
  if (name === '.' || name === '..') throw new Error('Choose another name.');
  if (name.length > 255) throw new Error('That name is too long.');
  return name;
}
