import { deleteApplicationRow } from '@/data/applications';
import { logSecurityEvent } from '@/data/security-events';
import { removeCoverLetterObject } from '@/data/storage';
import { reportError } from './report-error';

/**
 * Delete an application (SPEC §9.2) — the one path, used by the detail screen
 * and exercised as-is by the §7.8.4 test in e2e/security.spec.ts.
 *
 * The row goes first, and its notes and status_history rows go with it (on
 * delete cascade). Then the cover letter it held is removed from Storage,
 * which does not cascade. Row first, because the other failure is worse: a row
 * whose file is gone is a broken record, while a file whose row is gone is an
 * orphan — reported for cleanup rather than failing a delete that has already
 * happened (§9.2).
 */
export async function deleteApplication(id: string): Promise<void> {
  const { coverLetterPath } = await deleteApplicationRow(id);
  if (!coverLetterPath) return;

  await removeCoverLetterObject(coverLetterPath)
    .then(() => logSecurityEvent('file_delete', 'success'))
    .catch((error: unknown) => reportError(error, { action: 'remove_cover_letter' }));
}
