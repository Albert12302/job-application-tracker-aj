import { deleteAccountRow } from '@/data/account';
import { signOut as endSession } from '@/data/auth';
import { removeAllOwnObjects } from '@/data/storage';

/**
 * Delete this account and everything in it (SPEC §9.7) — the one path, mirroring
 * services/delete-application.ts.
 *
 * An immediate hard delete: no grace period, no soft-delete flag. A 30-day
 * window means the data is still there, which is the opposite of what was
 * asked for, and it makes every query in the app responsible for remembering
 * to exclude it.
 *
 * **The order is the rule, because Storage does not cascade.** Files go first.
 * A failed Storage delete stops before the account is gone, so the user still
 * owns the files and can try again; the other order leaves objects nobody can
 * reach, in a folder named for a user who no longer exists.
 *
 * What happens after each step is what the copy has to be honest about, so the
 * caller is told which one it reached:
 * - failing at `files`, the account and all its data are untouched, though some
 *   files may already have gone;
 * - failing at `account`, the files are gone and the account is not — the
 *   §9.4 broken-record shape, and the reason a retry has to be able to finish.
 *   Re-running is safe: removing an object that is already gone is not an error
 *   here (data/storage.ts).
 */
export type DeletionStage = 'files' | 'account';

export type DeletionProgress = (stage: DeletionStage) => void;

/** Which step was under way when it failed — the dialog's copy turns on this. */
export class AccountDeletionError extends Error {
  readonly stage: DeletionStage;

  constructor(stage: DeletionStage, options?: { cause?: unknown }) {
    super(`account_deletion_failed_${stage}`, options);
    this.name = 'AccountDeletionError';
    this.stage = stage;
  }
}

export async function deleteAccount(userId: string, onProgress: DeletionProgress = () => {}): Promise<void> {
  onProgress('files');
  try {
    await removeAllOwnObjects(userId);
  } catch (error) {
    throw new AccountDeletionError('files', { cause: error });
  }

  onProgress('account');
  try {
    // The cascade takes applications, notes, status history, saved filters and
    // the profile with the auth.users row, and the security_events record is
    // written inside the function, where the service role can still name a user
    // who no longer exists (§9.7).
    await deleteAccountRow();
  } catch (error) {
    throw new AccountDeletionError('account', { cause: error });
  }

  // Deleting the user already revoked every refresh token server-side, which is
  // what §9.7 means by signing out everywhere; a global sign-out now would call
  // Auth as a user who no longer exists and fail. This only clears the tokens
  // this browser is still holding. A failure here must not report the deletion
  // as failed — the account is gone either way, and main.tsx clears the cache
  // on the session change.
  await endSession().catch(() => {});
}
