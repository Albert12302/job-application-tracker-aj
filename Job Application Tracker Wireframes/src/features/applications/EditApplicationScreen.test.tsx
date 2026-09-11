import { screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { EditApplicationScreen } from './EditApplicationScreen';

/**
 * The real form, service, and conversion — only the data calls are stubs. The
 * point of most of these is §9.1: a status changed here takes the same path as
 * the detail-screen selector, and never rides along as a column.
 */
const getApplication = vi.fn();
const listApplications = vi.fn();
const updateApplicationFields = vi.fn();
const changeApplicationStatus = vi.fn();

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
  getApplication: (...args: unknown[]) => getApplication(...args),
  listApplications: (...args: unknown[]) => listApplications(...args),
  updateApplicationFields: (...args: unknown[]) => updateApplicationFields(...args),
  changeApplicationStatus: (...args: unknown[]) => changeApplicationStatus(...args),
}));

const ID = 'a0000000-0000-0000-0000-000000000001';
const existing = applicationRow({
  id: ID,
  company: 'Northwind Traders',
  position: 'Senior Frontend Engineer',
  location: 'Austin, TX',
  description: 'Design-system team.',
  status: 'Interview',
  referral: true,
});

const renderEdit = (id = ID) =>
  renderRoutes({ '/applications/$id/edit': EditApplicationScreen }, `/applications/${id}/edit`);

beforeEach(() => {
  getApplication.mockReset().mockResolvedValue(existing);
  listApplications.mockReset().mockResolvedValue([existing]);
  updateApplicationFields.mockReset().mockResolvedValue(existing);
  changeApplicationStatus.mockReset().mockResolvedValue(existing);
});

describe('EditApplicationScreen', () => {
  it('arrives pre-filled with the record (§9.1)', async () => {
    const { container } = renderEdit();

    expect(await screen.findByLabelText('Company')).toHaveProperty('value', 'Northwind Traders');
    expect(screen.getByLabelText('Position')).toHaveProperty('value', 'Senior Frontend Engineer');
    expect(screen.getByLabelText('Location')).toHaveProperty('value', 'Austin, TX');
    expect(screen.getByLabelText('Job description')).toHaveProperty('value', 'Design-system team.');
    expect(screen.getByLabelText('Date applied')).toHaveProperty('value', '2026-08-08');
    expect(screen.getByRole('checkbox', { name: 'Applied through a referral' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('combobox', { name: 'Status' }).textContent).toContain('Interview');
    // Add's first-note field is not part of editing.
    expect(screen.queryByLabelText('First note (optional)')).toBeNull();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('saves the fields without the status, and returns to the application', async () => {
    const { user } = renderEdit();
    await user.clear(await screen.findByLabelText('Company'));
    await user.type(screen.getByLabelText('Company'), 'Contoso');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateApplicationFields).toHaveBeenCalledTimes(1));
    const [savedId, fields] = updateApplicationFields.mock.calls[0] ?? [];
    expect(savedId).toBe(ID);
    expect(fields).toMatchObject({ company: 'Contoso', location: 'Austin, TX', referral: true });
    expect(fields).not.toHaveProperty('status');
    // Unchanged status: nothing to record (§2).
    expect(changeApplicationStatus).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Route /applications/$id' })).toBeTruthy();
  });

  it('sends a changed status through the one status-change path (§9.1)', async () => {
    updateApplicationFields.mockResolvedValue({ ...existing, company: 'Northwind Traders' });
    const { user } = renderEdit();

    await user.click(await screen.findByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: 'Offer' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(changeApplicationStatus).toHaveBeenCalledWith(ID, 'Offer'));
    expect(updateApplicationFields.mock.calls[0]?.[1]).not.toHaveProperty('status');
  });

  it('re-normalizes the location on save, ignoring its own old spelling (§5.2)', async () => {
    listApplications.mockResolvedValue([existing, applicationRow({ location: 'Remote' })]);
    const { user } = renderEdit();

    await user.clear(await screen.findByLabelText('Location'));
    await user.type(screen.getByLabelText('Location'), 'austin, tx');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // "Austin, TX" is this application's own, so it does not win — the typed
    // spelling is title-cased instead, and the user can correct the casing.
    await waitFor(() => expect(updateApplicationFields.mock.calls[0]?.[1]).toMatchObject({ location: 'Austin, TX' }));
  });

  it('keeps what was typed when the save fails', async () => {
    updateApplicationFields.mockRejectedValue(new Error('network'));
    const { user } = renderEdit();

    await user.clear(await screen.findByLabelText('Company'));
    await user.type(screen.getByLabelText('Company'), 'Contoso');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save this application.");
    expect(screen.getByLabelText('Company')).toHaveProperty('value', 'Contoso');
    expect(screen.queryByRole('heading', { name: 'Route /applications/$id' })).toBeNull();
  });

  it('says not found for an application that is not there', async () => {
    getApplication.mockResolvedValue(null);
    renderEdit();
    expect(await screen.findByRole('heading', { name: 'Application not found' })).toBeTruthy();
  });
});
