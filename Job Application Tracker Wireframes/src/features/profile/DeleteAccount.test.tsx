import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_USER } from '@/test/factories';
import { DeleteAccountButton } from './DeleteAccountButton';

/**
 * The account-deletion dialog (SPEC §9.7) through the real button, dialog,
 * hook and service; only the calls that leave the browser are stubs. The
 * ordering rule is pinned in services/delete-account.test.ts — these assert
 * what stands between a user and an irreversible act.
 */

const removeAllOwnObjects = vi.fn();
const deleteAccountRow = vi.fn();
const signOut = vi.fn();
const countApplications = vi.fn();
const countAllNotes = vi.fn();
const countCoverLetters = vi.fn();
const navigate = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));
vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => TEST_USER,
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/data/storage', () => ({
  removeAllOwnObjects: (...a: unknown[]) => removeAllOwnObjects(...a),
  downloadCoverLetter: async () => new Blob(['%PDF-1.4']),
  downloadAvatar: async () => new Blob(['PNG']),
}));
vi.mock('@/data/account', () => ({ deleteAccountRow: (...a: unknown[]) => deleteAccountRow(...a) }));
vi.mock('@/data/auth', () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
vi.mock('@/data/applications', () => ({
  countApplications: (...a: unknown[]) => countApplications(...a),
  countCoverLetters: (...a: unknown[]) => countCoverLetters(...a),
  listApplications: async () => [],
}));
vi.mock('@/data/notes', () => ({ countAllNotes: (...a: unknown[]) => countAllNotes(...a), listAllNotes: async () => [] }));
vi.mock('@/data/status-history', () => ({ listStatusHistory: async () => [] }));
vi.mock('@/data/saved-filters', () => ({ listSavedFilters: async () => [] }));
vi.mock('@/data/profile', () => ({ getProfile: async () => ({ id: TEST_USER.id, name: 'Dev A', avatar_path: null }) }));
vi.mock('@/lib/save-file', () => ({ saveFile: () => {} }));

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeleteAccountButton />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

/** Opens the dialog and waits for the counts to land. */
async function openDialog() {
  const rendered = renderProfile();
  await rendered.user.click(screen.getByRole('button', { name: 'Delete my account' }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText(/Deletes 7 applications/);
  return { ...rendered, dialog };
}

beforeEach(() => {
  removeAllOwnObjects.mockReset().mockResolvedValue(undefined);
  deleteAccountRow.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  countApplications.mockReset().mockResolvedValue(7);
  countAllNotes.mockReset().mockResolvedValue(12);
  countCoverLetters.mockReset().mockResolvedValue(2);
  navigate.mockReset();
});

describe('Delete my account', () => {
  it('names exactly what goes, counted when the dialog opens (§9.7)', async () => {
    const { dialog } = await openDialog();

    expect(dialog.textContent).toContain(
      "Deletes 7 applications, 12 notes, 2 files, and this account. This can't be undone.",
    );
  });

  it('offers the export first (§9.8)', async () => {
    const { dialog } = await openDialog();

    expect(within(dialog).getByText('Export my data first')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Export my data' })).toBeTruthy();
  });

  it('will not delete until the account email is typed — no "yes I am sure" button', async () => {
    const { dialog, user } = await openDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Delete my account' });

    expect(confirm).toHaveProperty('disabled', true);

    await user.type(within(dialog).getByLabelText('Type your email address to confirm'), 'dev-b@example.test');
    expect(confirm).toHaveProperty('disabled', true);

    await user.clear(within(dialog).getByLabelText('Type your email address to confirm'));
    await user.type(within(dialog).getByLabelText('Type your email address to confirm'), TEST_USER.email);
    expect(confirm).toHaveProperty('disabled', false);

    expect(removeAllOwnObjects).not.toHaveBeenCalled();
  });

  it('deletes files before the account, then lands on sign-in saying so (§9.7)', async () => {
    const { dialog, user } = await openDialog();

    await user.type(within(dialog).getByLabelText('Type your email address to confirm'), TEST_USER.email);
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(removeAllOwnObjects).toHaveBeenCalledWith(TEST_USER.id);
    expect(deleteAccountRow).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { deleted: true }, replace: true });
  });

  it('a failed Storage delete says the account is still here, and stops short of deleting it', async () => {
    removeAllOwnObjects.mockRejectedValue(new Error('storage down'));
    const { dialog, user } = await openDialog();

    await user.type(within(dialog).getByLabelText('Type your email address to confirm'), TEST_USER.email);
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('It and your data are still here');
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(deleteAccountRow).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a failed account delete admits the files are gone, and confirming again finishes it', async () => {
    deleteAccountRow.mockRejectedValueOnce(new Error('function down'));
    const { dialog, user } = await openDialog();

    await user.type(within(dialog).getByLabelText('Type your email address to confirm'), TEST_USER.email);
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Your files have been removed');
    expect(alert.textContent).toContain('Try again to finish.');

    // The dialog stays open on what remains, and confirming again carries on.
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  });

  it('Escape closes it and returns focus to the trigger (§10.2)', async () => {
    const { user } = await openDialog();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete my account' }));
  });

  it('is clean to axe with the dialog open', async () => {
    const { baseElement } = await openDialog();

    expect((await axe.run(baseElement)).violations).toEqual([]);
  });
});
