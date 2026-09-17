import { AVATAR_ERRORS, AVATAR_SNIFF_BYTES, avatarProblem, sniffAvatarType } from '@/domain/avatar';
import { setAvatarPath } from '@/data/profile';
import { logSecurityEvent } from '@/data/security-events';
import { removeAvatarObject, type UploadRefusal, UploadRefusedError, uploadFile } from '@/data/storage';
import { reportError } from './report-error';

/** The file was refused for a reason the user can fix. Not a bug; not reported. */
export class AvatarRejectedError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super('avatar_rejected');
    this.name = 'AvatarRejectedError';
    this.userMessage = userMessage;
  }
}

export const AVATAR_RATE_LIMITED = "You've uploaded a lot of files recently. Try again in an hour.";

/** The upload function's refusals, in the same words as the checks below (§8.2). */
const REFUSAL_COPY: Record<UploadRefusal, string> = {
  type: AVATAR_ERRORS.type,
  size: AVATAR_ERRORS.size,
  dimensions: AVATAR_ERRORS.dimensions,
  rate_limited: AVATAR_RATE_LIMITED,
};

/** Undecodable despite a valid signature → null, and it is refused as the wrong type. */
async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * Replace the profile photo (SPEC §4.6, §7.3).
 *
 * The checks here run first so a refusal needs no round trip — they are UX. The
 * upload function repeats them on the bytes it receives, and those are the ones
 * that count; its refusals map to the same copy.
 *
 * Order mirrors §9.4: the new object commits and the profile points at it
 * before the old object is deleted, so a failure midway never leaves the
 * profile pointing at nothing. Returns the new storage path.
 */
export async function setAvatar(userId: string, file: File, previousPath: string | null): Promise<string> {
  const type = sniffAvatarType(new Uint8Array(await file.slice(0, AVATAR_SNIFF_BYTES).arrayBuffer()));
  if (type === null) throw new AvatarRejectedError(AVATAR_ERRORS.type);

  const sizeProblem = avatarProblem({ type, size: file.size });
  if (sizeProblem) throw new AvatarRejectedError(sizeProblem);

  const dimensions = await imageSize(file);
  if (!dimensions) throw new AvatarRejectedError(AVATAR_ERRORS.type);
  const dimensionProblem = avatarProblem({ type, size: file.size, ...dimensions });
  if (dimensionProblem) throw new AvatarRejectedError(dimensionProblem);

  // The function names the file (a UUID; the original name is never stored,
  // §7.3) and logs the upload, or the limit trip, itself.
  let path: string;
  try {
    path = await uploadFile('avatar', file);
  } catch (error) {
    if (error instanceof UploadRefusedError) throw new AvatarRejectedError(REFUSAL_COPY[error.reason]);
    throw error;
  }

  try {
    // Only if the profile still holds `previousPath`, which is deleted below on the strength of this write.
    await setAvatarPath(userId, path, previousPath);
  } catch (error) {
    // The profile never pointed at the new object, so it must not outlive this call.
    await removeAvatarObject(path).catch((cleanup: unknown) => reportError(cleanup, { action: 'upload_avatar' }));
    throw error;
  }

  if (previousPath) {
    // The new photo is saved; a stale object is an orphan to clean up, not a failed upload (§9.2).
    await removeAvatarObject(previousPath)
      .then(() => logSecurityEvent('file_delete', 'success'))
      .catch((error: unknown) => reportError(error, { action: 'remove_avatar' }));
  }

  return path;
}
