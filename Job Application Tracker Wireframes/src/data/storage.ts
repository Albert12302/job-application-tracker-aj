import { FunctionsHttpError } from '@supabase/supabase-js';
import { canPreviewCoverLetter } from '@/domain/cover-letter';
import { storageObjectInfoSchema, uploadResponseSchema } from '@/domain/schemas';
import { supabase } from './client';

/**
 * Storage access. Both buckets are private (SPEC §7.2); every path is
 * `{user_id}/{uuid}.ext`, and the bucket policies check that first segment.
 *
 * Writes go through the `upload` edge function: the buckets accept none from
 * the client (§7.3). The function reads the bytes, chooses the path, and stores
 * the file; the client only reads and deletes.
 */

const AVATARS = 'avatars';
const COVER_LETTERS = 'cover-letters';

export type UploadKind = 'avatar' | 'cover-letter';
export type UploadRefusal = 'type' | 'size' | 'dimensions' | 'rate_limited';

/** The function refused the file for a reason the user can fix. Not a bug; not reported. */
export class UploadRefusedError extends Error {
  readonly reason: UploadRefusal;

  constructor(reason: UploadRefusal, options?: { cause?: unknown }) {
    super(`upload_refused_${reason}`, { cause: options?.cause });
    this.name = 'UploadRefusedError';
    this.reason = reason;
  }
}

// The status is the contract (supabase/functions/upload/README.md); the body copy is not rendered.
const REFUSAL_BY_STATUS: Record<number, UploadRefusal> = {
  413: 'size',
  415: 'type',
  422: 'dimensions',
  429: 'rate_limited',
};

/** Stores `file` and returns the path the function chose for it. */
export async function uploadFile(kind: UploadKind, file: Blob): Promise<string> {
  const { data, error } = await supabase.functions.invoke(`upload/${kind}`, { body: file });
  if (error) {
    const status = error instanceof FunctionsHttpError && error.context instanceof Response ? error.context.status : 0;
    const reason = REFUSAL_BY_STATUS[status];
    throw reason ? new UploadRefusedError(reason, { cause: error }) : error;
  }
  return uploadResponseSchema.parse(data).path;
}

/**
 * The avatar as a data: URL. Downloaded through the authenticated client rather
 * than a signed URL, so no fetchable link to the file ever sits in the page;
 * a data: URL also needs no revoking, unlike a blob: URL.
 */
export async function downloadAvatarDataUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(AVATARS).download(path);
  if (error) throw error;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('avatar_read_failed'));
    reader.readAsDataURL(data);
  });
}

/** §7.3: long enough to start the download it was made for, and no longer. */
export const SIGNED_URL_TTL_SECONDS = 60;

/** The stored file's size in bytes, from Storage's own record of the object. */
export async function coverLetterSize(path: string): Promise<number> {
  const { data, error } = await supabase.storage.from(COVER_LETTERS).info(path);
  if (error) throw error;
  return storageObjectInfoSchema.parse(data).size;
}

/**
 * The cover letter's bytes, fetched through a 60-second signed URL made for
 * this one request and never put in the page (§7.3).
 *
 * Fetched rather than handed to the browser as a link, so the app names the
 * saved file: Storage's `Content-Disposition` percent-encodes the name in its
 * plain `filename` parameter, which WebKit uses — on iOS a letter would save as
 * `Caf%C3%A9%20letter.pdf`. A failed or expired URL is then an error the
 * screen can show, not a tab navigated to a JSON error.
 *
 * `download` with no name still makes Storage answer as an attachment, should
 * the URL ever be opened directly, and keeps the original name out of the
 * request.
 */
export async function downloadCoverLetter(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(COVER_LETTERS).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const response = await fetch(`${data.signedUrl}&download`);
  if (!response.ok) throw new StorageDownloadError(response.status);
  return response.blob();
}

/**
 * A 60-second signed URL to open a PDF cover letter in its own tab (§4.4, §7.3).
 *
 * Without `download`, Storage serves the file inline, typed by the upload
 * function's sniff, so the browser's own PDF viewer shows it — on Storage's
 * origin, never the app's, so nothing in the file can reach the session. Only
 * a PDF: a Word file would just download, and none is ever made into a page.
 */
export async function coverLetterPreviewUrl(path: string): Promise<string> {
  if (!canPreviewCoverLetter(path)) throw new Error('preview_not_pdf');
  const { data, error } = await supabase.storage.from(COVER_LETTERS).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** Storage refused a signed URL's download; the status is kept for the error code, the body is not. */
export class StorageDownloadError extends Error {
  readonly status: number;

  constructor(status: number) {
    super('storage_download_failed');
    this.name = 'StorageDownloadError';
    this.status = status;
  }
}

async function removeObject(bucket: string, path: string): Promise<void> {
  const { data, error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
  // An empty result means nothing was deleted — an orphan, which the caller reports.
  if (!data?.length) throw new Error('storage_remove_noop');
}

export function removeAvatarObject(path: string): Promise<void> {
  return removeObject(AVATARS, path);
}

export function removeCoverLetterObject(path: string): Promise<void> {
  return removeObject(COVER_LETTERS, path);
}
