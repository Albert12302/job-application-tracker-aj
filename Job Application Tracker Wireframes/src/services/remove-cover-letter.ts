import { setCoverLetter } from '@/data/applications';
import { logSecurityEvent } from '@/data/security-events';
import { removeCoverLetterObject } from '@/data/storage';
import type { Application } from '@/domain/schemas';
import { reportError } from './report-error';

/**
 * Remove an application's cover letter (SPEC §9.4), once the user has
 * confirmed it.
 *
 * The row lets go of the file first — only if it still holds `path` — so the
 * letter is gone from the user's point of view the moment this resolves. Then
 * the object is deleted. The other order would be worse on failure: a row
 * pointing at a deleted file is a broken record, while a file no row points at
 * is an orphan, reported for cleanup as §9.2 does.
 */
export async function removeCoverLetter(applicationId: string, path: string): Promise<Application> {
  const saved = await setCoverLetter(applicationId, null, path);

  await removeCoverLetterObject(path)
    .then(() => logSecurityEvent('file_delete', 'success'))
    .catch((error: unknown) => reportError(error, { action: 'remove_cover_letter' }));

  return saved;
}
