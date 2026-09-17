import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteRateLimitedError } from '@/data/write-limit';
import type { Application } from '@/domain/schemas';
import { applicationRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { ApplicationsScreen } from './ApplicationsScreen';

/**
 * Bulk delete from the list (SPEC §4.2, §9.2): the real screen, selection,
 * dialog, and mutation. The stubs are the list read, the note count, and the
 * one delete path — which keeps a table the list read comes back from, so a
 * refetch after a delete does not bring the rows back.
 */
let table: Application[] = [];
const deleteApplication = vi.fn();
const countNotes = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => ({ id: '11111111-1111-1111-1111-111111111111', email: 'dev-a@example.test' }),
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));

vi.mock('@/data/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/applications')>()),
  listApplications: async () => table,
}));

vi.mock('@/data/saved-filters', () => ({
  listSavedFilters: async () => [],
}));

vi.mock('@/data/notes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/notes')>()),
  countNotes: (...args: unknown[]) => countNotes(...args),
}));

vi.mock('@/services/delete-application', () => ({
  deleteApplication: (...args: unknown[]) => deleteApplication(...args),
}));

const LITWARE = applicationRow({ company: 'Litware', date_applied: '2026-09-12T00:00:00+00:00' });
const CONTOSO = applicationRow({
  company: 'Contoso',
  date_applied: '2026-09-10T00:00:00+00:00',
  cover_letter_path: '11111111-1111-1111-1111-111111111111/c.pdf',
  cover_letter_name: 'c.pdf',
});
const FABRIKAM = applicationRow({ company: 'Fabrikam', date_applied: '2026-09-08T00:00:00+00:00' });

/** Deletes from the stub table, as the real delete would from the database. */
const deletes = (id: string) => {
  table = table.filter((row) => row.id !== id);
  return Promise.resolve();
};

const renderList = () => renderRoutes({ '/applications': ApplicationsScreen }, '/applications');

beforeEach(() => {
  table = [LITWARE, CONTOSO, FABRIKAM];
  deleteApplication.mockReset().mockImplementation(deletes);
  countNotes.mockReset().mockResolvedValue(3);
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('bulk delete', () => {
  it('ticks rows without opening them, and says how many are selected', async () => {
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Litware' }));

    expect(screen.queryByRole('heading', { name: 'Route /applications/$id' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Litware' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('1 selected', { selector: 'p:not([role])' })).toBeTruthy();
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('1 selected');
    // Some, not all: the header box is mixed.
    expect(screen.getByRole('checkbox', { name: 'Select all applications' }).getAttribute('aria-checked')).toBe('mixed');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
  });

  it('selects all from the header, and deletes them after naming them and what goes with them (§9.2)', async () => {
    const { user, container } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select all applications' }));
    await user.click(screen.getByRole('button', { name: 'Delete 3 applications' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete 3 applications?' })).toBeTruthy();
    await waitFor(() =>
      expect(dialog.textContent).toContain(
        'Litware, Contoso, and Fabrikam. This also deletes 3 notes and 1 attached file. This cannot be undone.',
      ),
    );
    expect(countNotes).toHaveBeenCalledWith([LITWARE.id, CONTOSO.id, FABRIKAM.id]);
    expect((await axe.run(container)).violations).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete 3 applications' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // One path, one application at a time, in list order.
    expect(deleteApplication.mock.calls).toEqual([[LITWARE.id], [CONTOSO.id], [FABRIKAM.id]]);
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeTruthy();
  });

  it('names a single selected application the way the detail screen does', async () => {
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Fabrikam' }));
    await user.click(screen.getByRole('button', { name: 'Delete 1 application' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete your application to Fabrikam?' })).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Keep application' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteApplication).not.toHaveBeenCalled();
    // Keeping them keeps them selected.
    expect(screen.getByRole('checkbox', { name: 'Select Fabrikam' }).getAttribute('aria-checked')).toBe('true');
  });

  it('stops at a failure, says where, keeps the rest selected, and confirming again carries on', async () => {
    deleteApplication
      .mockImplementationOnce(deletes)
      .mockImplementationOnce(() => Promise.reject(Object.assign(new Error('boom'), { code: '500' })));
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select all applications' }));
    await user.click(screen.getByRole('button', { name: 'Delete 3 applications' }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete 3 applications' })).toHaveProperty('disabled', false));
    await user.click(within(dialog).getByRole('button', { name: 'Delete 3 applications' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain("Deleted 1 of 3 applications. Couldn't delete Contoso.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(alert.textContent).not.toContain('boom');
    // Fabrikam was never tried.
    expect(deleteApplication.mock.calls).toEqual([[LITWARE.id], [CONTOSO.id]]);
    expect(within(dialog).getByRole('heading', { name: 'Delete 2 applications?' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Select Litware' })).toBeNull());

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete 2 applications' })).toHaveProperty('disabled', false));
    await user.click(within(dialog).getByRole('button', { name: 'Delete 2 applications' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteApplication.mock.calls.slice(2)).toEqual([[CONTOSO.id], [FABRIKAM.id]]);
  });

  it('asks the user to wait out the write limit, with no error reference (§7.1)', async () => {
    deleteApplication.mockImplementationOnce(() => Promise.reject(new WriteRateLimitedError()));
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Litware' }));
    await user.click(screen.getByRole('button', { name: 'Delete 1 application' }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete 1 application' })).toHaveProperty('disabled', false));
    await user.click(within(dialog).getByRole('button', { name: 'Delete 1 application' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain("Couldn't delete Litware. You've made a lot of changes in the last minute.");
    expect(alert.textContent).not.toMatch(/Error reference/);
  });

  it('still confirms when the note count cannot load, without claiming a number', async () => {
    countNotes.mockRejectedValue(new Error('network'));
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Contoso' }));
    await user.click(screen.getByRole('button', { name: 'Delete 1 application' }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(dialog.textContent).toContain('Their notes and attached files are deleted with them.'));
    expect(within(dialog).getByRole('button', { name: 'Delete 1 application' })).toHaveProperty('disabled', false);
  });

  it('puts a checkbox on each card below 760px, and Select all in the bar (§11)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }),
    });
    const { user, container } = renderList();
    const cards = await screen.findByRole('list', { name: 'Your applications, newest first' });
    await user.click(within(cards).getByRole('checkbox', { name: 'Select Contoso' }));
    await user.click(screen.getByRole('button', { name: 'Select all 3' }));
    expect(screen.getByRole('button', { name: 'Delete 3 applications' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select all 3' })).toBeNull();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
