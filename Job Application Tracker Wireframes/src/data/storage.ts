import { FunctionsHttpError } from '@supabase/supabase-js';
import { uploadResponseSchema } from '@/domain/schemas';
import { supabase } from './client';

/**
 * Storage access. Both buckets are private (SPEC §7.2); every path is
 * `{user_id}/{uuid}.ext`, and the bucket policies check that first segment.
 *
 * Writes go through the `upload` edge function: the buckets accept none from
 * the client (§7.3). The function reads the bytes, chooses the path, and stores
 * the file; the client only reads and deletes. Cover letters land here in step 3.
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
