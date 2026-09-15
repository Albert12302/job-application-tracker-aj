import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationRow, TEST_USER } from '@/test/factories';
import { ExportDataButton } from './ExportDataButton';

/**
 * Export my data through the real button, hook and service (SPEC §9.8); only
 * the calls that leave the browser are stubs. What the zip holds is pinned in
 * services/export-data.test.ts — these assert what the user sees and hears.
 */

const listApplications = vi.fn();
const downloadCoverLetter = vi.fn();
const saveFile = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));
vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => TEST_USER,
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));
vi.mock('@/data/applications', () => ({ listApplications: (...a: unknown[]) => listApplications(...a) }));
vi.mock('@/data/notes', () => ({ listAllNotes: async () => [] }));
vi.mock('@/data/status-history', () => ({ listStatusHistory: async () => [] }));
vi.mock('@/data/saved-filters', () => ({ listSavedFilters: async () => [] }));
vi.mock('@/data/profile', () => ({ getProfile: async () => ({ id: TEST_USER.id, name: 'Dev A', avatar_path: null }) }));
vi.mock('@/data/storage', () => ({
  downloadCoverLetter: (...a: unknown[]) => downloadCoverLetter(...a),
  downloadAvatar: async () => new Blob(['PNG']),
}));
vi.mock('@/lib/save-file', () => ({ saveFile: (...a: unknown[]) => saveFile(...a) }));

const WITH_LETTER = applicationRow({
  company: 'Contoso',
  cover_letter_path: `${TEST_USER.id}/aaaa1111.pdf`,
  cover_letter_name: 'Contoso letter.pdf',
});

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ExportDataButton />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

/** A promise this test resolves, so the button can be caught mid-export. */
function deferred<T>() {
  let settle!: (value: T) => void;
  let fail!: (reason: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

beforeEach(() => {
  listApplications.mockReset().mockResolvedValue([applicationRow(), WITH_LETTER]);
  downloadCoverLetter.mockReset().mockResolvedValue(new Blob(['%PDF-1.4']));
  saveFile.mockReset();
});

describe('Export my data', () => {
  it('saves a zip named for today', async () => {
    const { user } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Export my data' }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const [zip, filename] = saveFile.mock.calls[0]!;
    expect(zip).toBeInstanceOf(Blob);
    expect(filename).toMatch(/^job-application-tracker-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('counts the files in the button while it works, and says so out loud (§9.8, §10.4)', async () => {
    const letter = deferred<Blob>();
    downloadCoverLetter.mockReturnValue(letter.promise);
    const { user } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Export my data' }));

    // One cover letter to fetch, and it has not arrived yet.
    const progress = await screen.findByRole('button', { name: 'Adding files (0 of 1)…' });
    expect(progress).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toBe('Adding files (0 of 1)…');

    letter.settle(new Blob(['%PDF-1.4']));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Your export is ready.'));
    expect(screen.getByRole('button', { name: 'Export my data' })).toHaveProperty('disabled', false);
  });

  it('shows the failure with its reference, and Retry runs it again (§8.1, §8.2)', async () => {
    listApplications.mockRejectedValueOnce(new Error('network'));
    const { user } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Export my data' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't export your data.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(saveFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
  });

  it('a failed file leaves the export succeeding, with no error shown', async () => {
    downloadCoverLetter.mockRejectedValue(new Error('storage_download_failed'));
    const { user } = renderButton();

    await user.click(screen.getByRole('button', { name: 'Export my data' }));

    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is clean to axe, at rest and in its error state', async () => {
    listApplications.mockRejectedValueOnce(new Error('network'));
    const { container, user } = renderButton();

    expect((await axe.run(container)).violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Export my data' }));
    await screen.findByRole('alert');

    expect((await axe.run(container)).violations).toEqual([]);
  });
});
