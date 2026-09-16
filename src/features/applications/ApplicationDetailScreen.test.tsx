import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationRow, noteRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { ApplicationDetailScreen } from './ApplicationDetailScreen';

const getApplication = vi.fn();
const changeApplicationStatus = vi.fn();
const setStarred = vi.fn();
const deleteApplicationRow = vi.fn();
const listNotes = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => ({ id: '11111111-1111-1111-1111-111111111111', email: 'dev-a@example.test' }),
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));

// The notes have their own tests; here they only count towards the delete copy.
vi.mock('@/data/notes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/notes')>()),
  listNotes: (...args: unknown[]) => listNotes(...args),
}));

vi.mock('@/data/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/applications')>()),
  getApplication: (...args: unknown[]) => getApplication(...args),
  changeApplicationStatus: (...args: unknown[]) => changeApplicationStatus(...args),
  setStarred: (...args: unknown[]) => setStarred(...args),
  deleteApplicationRow: (...args: unknown[]) => deleteApplicationRow(...args),
}));

const ID = 'a0000000-0000-0000-0000-000000000001';
const renderDetail = (id = ID) =>
  renderRoutes({ '/applications/$id': ApplicationDetailScreen }, `/applications/${id}`);

beforeEach(() => {
  getApplication.mockReset();
  changeApplicationStatus.mockReset();
  setStarred.mockReset();
  deleteApplicationRow.mockReset().mockResolvedValue({ coverLetterPath: null });
  listNotes.mockReset().mockResolvedValue([]);
});

describe('ApplicationDetailScreen', () => {
  it('shows a skeleton while it loads', async () => {
    getApplication.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(await screen.findByText('Loading this application')).toBeTruthy();
  });

  it('shows the application, its dates in UTC and its funnel position', async () => {
    getApplication.mockResolvedValue(
      applicationRow({
        id: ID,
        company: 'Northwind Traders',
        position: 'Senior Frontend Engineer',
        status: 'Callback',
        location: 'Austin, TX',
        referral: true,
        description: 'Design-system team.',
      }),
    );
    const { container } = renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Northwind Traders' })).toBeTruthy();
    expect(screen.getByText('Senior Frontend Engineer')).toBeTruthy();
    // UTC midnight on the 8th is the 8th in every zone (§5.4).
    expect(screen.getByText(/Applied .*8.*2026/)).toBeTruthy();
    expect(screen.getByText('Austin, TX')).toBeTruthy();
    expect(screen.getByText('Referral')).toBeTruthy();
    expect(screen.getByText('Design-system team.')).toBeTruthy();
    expect(screen.getByText('No cover letter attached.')).toBeTruthy();

    const steps = within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem');
    expect(steps[2]?.getAttribute('aria-current')).toBe('step');
    expect(steps[3]?.getAttribute('aria-current')).toBeNull();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('says an application is not found without saying whose it was (§8.2)', async () => {
    getApplication.mockResolvedValue(null);
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Application not found' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to applications' })).toBeTruthy();
    expect(screen.queryByText(/permission|owner|another/i)).toBeNull();
  });

  it('treats an id that is not an id as not found, and asks the database nothing', async () => {
    renderDetail('not-an-id');
    expect(await screen.findByRole('heading', { name: 'Application not found' })).toBeTruthy();
    expect(getApplication).not.toHaveBeenCalled();
  });

  it('offers Retry and a way back when the load fails', async () => {
    getApplication.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(applicationRow({ id: ID }));
    const { user } = renderDetail();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load this application.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(screen.getByRole('link', { name: 'Back to list' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Northwind Traders' })).toBeTruthy();
  });

  it('changes the status through the one path, and puts it back if that fails (§8.3)', async () => {
    getApplication.mockResolvedValue(applicationRow({ id: ID, status: 'Applied' }));
    let fail: (reason: unknown) => void = () => {};
    changeApplicationStatus.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
    const { user } = renderDetail();

    await user.click(await screen.findByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Interview' }));

    await waitFor(() => expect(changeApplicationStatus).toHaveBeenCalledWith(ID, 'Interview'));
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Interview');

    fail(new Error('network'));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Applied'),
    );
  });

  it('names the record and what goes with it before deleting (§9.2)', async () => {
    getApplication.mockResolvedValue(
      applicationRow({ id: ID, company: 'Tailspin Toys', cover_letter_path: 'x/y.pdf', cover_letter_name: 'cl.pdf' }),
    );
    listNotes.mockResolvedValue([noteRow({ application_id: ID }), noteRow({ application_id: ID })]);
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Delete application' }));
    expect(await screen.findByText('Delete your application to Tailspin Toys?')).toBeTruthy();
    expect(screen.getByText(/This also deletes 2 notes and 1 attached file\. This cannot be undone\./)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Keep application' }));
    await waitFor(() => expect(screen.queryByText('Delete your application to Tailspin Toys?')).toBeNull());
    expect(deleteApplicationRow).not.toHaveBeenCalled();
  });

  it('deletes through the delete service and returns to the list', async () => {
    getApplication.mockResolvedValue(applicationRow({ id: ID, company: 'Tailspin Toys' }));
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Delete application' }));
    await user.click(await screen.findByRole('button', { name: 'Delete application' }));

    await waitFor(() => expect(deleteApplicationRow).toHaveBeenCalledWith(ID));
    expect(await screen.findByRole('heading', { name: 'Route /applications' })).toBeTruthy();
  });

  it('keeps the application and says so when the delete fails', async () => {
    getApplication.mockResolvedValue(applicationRow({ id: ID, company: 'Tailspin Toys' }));
    deleteApplicationRow.mockRejectedValue(new Error('network'));
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Delete application' }));
    await user.click(await screen.findByRole('button', { name: 'Delete application' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't delete this application.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(screen.queryByRole('heading', { name: 'Route /applications' })).toBeNull();
  });

  it('stars the application from its header', async () => {
    getApplication.mockResolvedValue(applicationRow({ id: ID, company: 'Contoso', starred: false }));
    setStarred.mockResolvedValue(undefined);
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Star Contoso' }));
    await waitFor(() => expect(setStarred).toHaveBeenCalledWith(ID, true));
  });
});
