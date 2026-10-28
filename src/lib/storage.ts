// Layerwise Storage: per-project file storage, available on the server as
// `env.STORAGE` from `cloudflare:workers`. Files are private by default.

export type StorageVisibility = 'public' | 'private';

export type StorageObject = {
  key: string;
  size: number;
  etag: string;
  contentType: string;
  visibility: StorageVisibility;
  uploaded: Date;
  customMetadata: Record<string, string>;
};

export type StorageRange =
  { offset: number; length?: number } | { suffix: number };

export type StorageObjectBody = StorageObject & {
  body: ReadableStream<Uint8Array>;
  range?: { offset: number; length: number };
};

export type StoragePutBody =
  ReadableStream<Uint8Array> | ArrayBuffer | ArrayBufferView | string;

export type StoragePutOptions = {
  // Required when the body is a stream.
  size?: number;
  contentType?: string;
  // Defaults to private.
  visibility?: StorageVisibility;
  customMetadata?: Record<string, string>;
};

export type StorageListOptions = {
  prefix?: string;
  cursor?: string;
  limit?: number;
  delimiter?: '/';
};

export type StorageListResult = {
  objects: StorageObject[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
};

export type StorageSignedUrlOptions = {
  // Seconds; defaults to 1 hour, at most 7 days.
  expiresIn?: number;
  // `true` or a file name makes the browser download instead of display.
  download?: boolean | string;
};

export type StorageCreateUploadInput = {
  key: string;
  size: number;
  contentType: string;
  visibility?: StorageVisibility;
  customMetadata?: Record<string, string>;
  overwrite?: boolean;
};

export type StorageUpload = {
  id: string;
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export type StorageUsage = {
  usedBytes: number;
  reservedBytes: number;
  // null when the plan sets no project quota.
  limitBytes: number | null;
  maxFileBytes: number;
  objectCount: number;
  // True when the project is over its Storage quota: reads, lists and deletes
  // still work, new writes fail with StorageQuotaExceeded.
  readOnly: boolean;
  // Counts toward limitBytes too, until it expires or is emptied.
  trashBytes: number;
  trashObjectCount: number;
};

// Keys look like paths (`invoices/<id>.pdf`): no leading `/`, no empty, `.` or
// `..` segments, at most 900 bytes. Keep original file names in D1 or
// `customMetadata`.
export interface ProjectStorageRpc {
  // Metadata only; null when missing. Forks do not copy files.
  head(key: string): Promise<StorageObject | null>;
  get(
    key: string,
    options?: { range?: StorageRange }
  ): Promise<StorageObjectBody | null>;
  // Requests through the app carry about 90 MB; use createUpload above that.
  put(
    key: string,
    body: StoragePutBody,
    options?: StoragePutOptions
  ): Promise<StorageObject>;
  // In the local preview, deleted and overwritten files go to the trash, kept
  // for 7 days by default.
  delete(keys: string | string[]): Promise<void>;
  list(options?: StorageListOptions): Promise<StorageListResult>;
  // Public URLs are cached for up to 5 minutes, so an overwritten or deleted
  // public file can stay visible that long.
  publicUrl(key: string): Promise<string>;
  // Short-lived link for a private file, including image previews.
  signedUrl(key: string, options?: StorageSignedUrlOptions): Promise<string>;
  setVisibility(
    key: string,
    visibility: StorageVisibility
  ): Promise<StorageObject>;
  // Browser direct upload: pass the result to `uploadToStorage`, then call
  // completeUpload(id) on the server. The file is stored only after
  // completeUpload succeeds; record the ID with the user who started it.
  createUpload(input: StorageCreateUploadInput): Promise<StorageUpload>;
  completeUpload(id: string): Promise<StorageObject>;
  // The plan's project quota (`limitBytes`, null when there is none) and
  // per-file limit (`maxFileBytes`). Check file sizes before uploading.
  usage(): Promise<StorageUsage>;
}

declare global {
  namespace Cloudflare {
    interface Env {
      STORAGE: Service & ProjectStorageRpc;
    }
  }
}

export type StorageErrorCode =
  // Over the quota: read-only until files are deleted or the plan is upgraded.
  | 'StorageQuotaExceeded'
  // Over the plan's per-file limit.
  | 'FileTooLarge'
  // Executables cannot be public.
  | 'BlockedFileType'
  // Rejected by abuse checks.
  | 'BlockedContent'
  | 'InvalidKey'
  | 'ObjectNotFound'
  // The createUpload target exists and `overwrite` is not set.
  | 'ObjectExists'
  // Unknown or expired upload, or the browser upload has not finished.
  | 'UploadNotFound'
  | 'UploadIncomplete'
  // Not allowed here, such as making a file public from the local preview.
  | 'NotAllowed';

const STORAGE_ERROR_CODES: ReadonlySet<string> = new Set<StorageErrorCode>([
  'StorageQuotaExceeded',
  'FileTooLarge',
  'BlockedFileType',
  'BlockedContent',
  'InvalidKey',
  'ObjectNotFound',
  'ObjectExists',
  'UploadNotFound',
  'UploadIncomplete',
  'NotAllowed'
]);

// Storage errors reach the app as `<Code>Error: <message>`, for example
// `StorageQuotaExceededError: Project storage is full (1 GB of 1 GB)`.
export function getStorageErrorCode(error: unknown): StorageErrorCode | null {
  if (!(error instanceof Error)) return null;
  const code = /^(\w+)Error: /.exec(error.message)?.[1];
  return code && STORAGE_ERROR_CODES.has(code)
    ? (code as StorageErrorCode)
    : null;
}

// Browser side of a direct upload: sends the file straight to Storage with the
// URL and headers from `env.STORAGE.createUpload()`. Afterwards, call a server
// function that runs `env.STORAGE.completeUpload(upload.id)`.
export async function uploadToStorage(
  upload: { url: string; headers: Record<string, string> },
  file: Blob
): Promise<void> {
  const response = await fetch(upload.url, {
    method: 'PUT',
    headers: upload.headers,
    body: file
  });
  if (!response.ok) {
    throw new Error(`Storage upload failed with status ${response.status}`);
  }
}
