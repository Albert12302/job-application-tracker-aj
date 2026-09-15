import type { DeletionSummary } from '@/queries/use-delete-account';
import type { DeletionStage } from '@/services/delete-account';

/**
 * The words the account-deletion dialog uses (SPEC §9.7). Kept out of the
 * component so the exact sentence shown before an irreversible act is unit
 * tested rather than eyeballed.
 */

const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/**
 * "Deletes 7 applications, 12 notes, 2 files, and this account. This can't be
 * undone." — §9.7's sentence, with what the user actually has.
 *
 * `null` counts mean the read failed. §9.2's rule applies: a count that cannot
 * be read must not block the delete, so the sentence loses its numbers rather
 * than the dialog losing its button.
 */
export function deletionSummarySentence(summary: DeletionSummary | null): string {
  const what = summary
    ? [
        plural(summary.applications, 'application', 'applications'),
        plural(summary.notes, 'note', 'notes'),
        plural(summary.files, 'file', 'files'),
      ].join(', ')
    : 'your applications, notes, files';
  return `Deletes ${what}, and this account. This can't be undone.`;
}

/** Progress in the confirm button, and in the live region beside it (§10.4). */
export function deletionProgressLabel(stage: DeletionStage | null): string {
  return stage === 'account' ? 'Deleting your account…' : 'Removing your files…';
}

/**
 * What failed, said in terms of what is still true — because the two failures
 * leave the account in visibly different places (§9.7).
 *
 * Neither is a dead end: confirming again carries on from where it stopped,
 * and re-removing files that have already gone is not an error.
 */
export function deletionFailureMessage(stage: DeletionStage | null): string {
  return stage === 'account'
    ? "Couldn't delete your account. Your files have been removed, but the account itself is still here. Try again to finish."
    : "Couldn't delete your account. It and your data are still here, though some files may already have been removed. Try again.";
}

/**
 * Whether the typed address confirms the account (§9.7). Trimmed and
 * case-folded: this is a confirmation that the right person is at the keyboard
 * and knows which account it is, not a password — and an address that differs
 * only in case is the same address to everyone who uses it.
 *
 * An account with no email can never be confirmed, so the button stays
 * disabled. Email and password is the only way in (§4.1), so that state does
 * not arise; failing closed is still the right way to not arise.
 */
export function emailMatches(typed: string, accountEmail: string | null): boolean {
  const expected = accountEmail?.trim().toLowerCase() ?? '';
  return expected.length > 0 && typed.trim().toLowerCase() === expected;
}
