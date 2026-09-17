import { logSecurityEvent } from '@/data/security-events';
import { removeAvatarObject, removeCoverLetterObject } from '@/data/storage';
import { reportError } from './report-error';

const BY_KIND = {
  avatar: { remove: removeAvatarObject, action: 'remove_avatar' },
  'cover-letter': { remove: removeCoverLetterObject, action: 'remove_cover_letter' },
} as const;

/**
 * Delete a Storage object nothing points at any more. A failure leaves an
 * orphan, reported for cleanup rather than failing what already happened
 * (§9.2); a success is logged (§7.7). Never throws.
 */
export async function discardObject(kind: keyof typeof BY_KIND, path: string): Promise<void> {
  const { remove, action } = BY_KIND[kind];
  await remove(path)
    .then(() => logSecurityEvent('file_delete', 'success'))
    .catch((error: unknown) => reportError(error, { action }));
}
