import { FunctionsHttpError } from '@supabase/supabase-js';
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
 * A 60-second signed URL that downloads the cover letter under `label`.
 * Made when the user asks for the file and used at once — never rendered into
 * the page (§7.3).
 *
 * `download` makes Storage answer with `Content-Disposition: attachment`, so
 * the file is saved rather than opened in the app's tab. It is appended here
 * rather than passed as createSignedUrl's `download` option, which
 * percent-encodes the name twice: `é` would arrive as the literal `%C3%A9`.
 */
export async function coverLetterDownloadUrl(path: string, label: string): Promise<string> {
  const { data, error } = await supabase.storage.from(COVER_LETTERS).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return `${data.signedUrl}&download=${encodeURIComponent(label)}`;
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
