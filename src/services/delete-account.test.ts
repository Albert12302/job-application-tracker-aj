import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_USER } from '@/test/factories';
import { AccountDeletionError, deleteAccount, type DeletionStage } from './delete-account';

/**
 * The order is the rule (SPEC §9.7), and it is the whole reason this file
 * exists: Storage does not cascade, so files go first and a failed Storage
 * delete stops *before* the account is gone. The reverse leaves objects in a
 * folder named for a user who no longer exists, with no owner to find them by.
 *
 * Every step is a stub that records itself, so the tests read the order back.
 */

const calls: string[] = [];
const removeAllOwnObjects = vi.fn();
const deleteAccountRow = vi.fn();
const signOut = vi.fn();

vi.mock('@/data/storage', () => ({ removeAllOwnObjects: (...a: unknown[]) => removeAllOwnObjects(...a) }));
vi.mock('@/data/account', () => ({ deleteAccountRow: (...a: unknown[]) => deleteAccountRow(...a) }));
vi.mock('@/data/auth', () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
vi.mock('@/data/client', () => ({ supabase: {} }));

const USER = TEST_USER.id;

beforeEach(() => {
  calls.length = 0;
  removeAllOwnObjects.mockReset().mockImplementation(async () => {
    calls.push('remove files');
  });
  deleteAccountRow.mockReset().mockImplementation(async () => {
    calls.push('delete account');
  });
  signOut.mockReset().mockImplementation(async () => {
    calls.push('sign out');
  });
});

describe('deleteAccount', () => {
  it('removes the files, then the account, then ends the session (§9.7)', async () => {
    await deleteAccount(USER);

    expect(calls).toEqual(['remove files', 'delete account', 'sign out']);
    expect(removeAllOwnObjects).toHaveBeenCalledWith(USER);
  });

  it('a failed Storage delete stops before the account is gone, so a retry still works', async () => {
    removeAllOwnObjects.mockRejectedValue(new Error('storage down'));

    await expect(deleteAccount(USER)).rejects.toThrow(AccountDeletionError);

    // The point of the order: nothing irreversible happened.
    expect(deleteAccountRow).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('names the step it failed at, so the dialog can say what is still true', async () => {
    removeAllOwnObjects.mockRejectedValue(new Error('storage down'));
    await expect(deleteAccount(USER)).rejects.toMatchObject({ stage: 'files' });

    removeAllOwnObjects.mockResolvedValue(undefined);
    deleteAccountRow.mockRejectedValue(new Error('function down'));
    await expect(deleteAccount(USER)).rejects.toMatchObject({ stage: 'account' });
  });

  it('keeps the original failure as the cause, so it is still reportable', async () => {
    const cause = new Error('function down');
    deleteAccountRow.mockRejectedValue(cause);

    await expect(deleteAccount(USER)).rejects.toMatchObject({ cause });
  });

  it('a failed sign-out does not report the deletion as failed — the account is gone either way', async () => {
    signOut.mockRejectedValue(new Error('network'));

    await expect(deleteAccount(USER)).resolves.toBeUndefined();
    expect(deleteAccountRow).toHaveBeenCalled();
  });

  it('reports each stage as it starts', async () => {
    const stages: DeletionStage[] = [];

    await deleteAccount(USER, (stage) => stages.push(stage));

    expect(stages).toEqual(['files', 'account']);
  });

  it('reports the files stage before failing in it, so the copy matches', async () => {
    removeAllOwnObjects.mockRejectedValue(new Error('storage down'));
    const stages: DeletionStage[] = [];

    await expect(deleteAccount(USER, (stage) => stages.push(stage))).rejects.toThrow();

    expect(stages).toEqual(['files']);
  });
});
