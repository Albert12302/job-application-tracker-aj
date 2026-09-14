import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteRateLimitedError } from '@/data/applications';
import type { SavedFilter } from '@/domain/schemas';
import { ApplicationsScreen } from '@/features/applications/ApplicationsScreen';
import { applicationRow, TEST_USER } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';

/**
 * The filter builder on the real list screen (SPEC §4.2, §5.1, §8.2): the
 * form, its keyboard operation (§10.2), and what a save does to the tabs.
 */
const listSavedFilters = vi.fn();
const createSavedFilter = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => TEST_USER,
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));

vi.mock('@/data/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/applications')>()),
  listApplications: async () => [
    applicationRow({ company: 'Northwind Traders', location: 'Austin, TX', status: 'Callback', referral: true }),
    applicationRow({ company: 'Contoso', location: 'Remote', status: 'Interview' }),
    applicationRow({ company: 'Litware', location: 'Austin, TX', status: 'Applied' }),
  ],
}));

vi.mock('@/data/saved-filters', () => ({
  listSavedFilters: (...args: unknown[]) => listSavedFilters(...args),
  createSavedFilter: (...args: unknown[]) => createSavedFilter(...args),
  deleteSavedFilter: vi.fn(),
}));

let savedTable: SavedFilter[] = [];

const stored = (input: Omit<SavedFilter, 'id' | 'user_id' | 'created_at'>): SavedFilter => ({
  ...input,
  id: crypto.randomUUID(),
  user_id: TEST_USER.id,
  created_at: '2026-09-13T10:00:00+00:00',
});

beforeEach(() => {
  savedTable = [stored({ name: 'Custom 2', statuses: [], referral: 'any', starred: 'any', location: null, text: null })];
  listSavedFilters.mockReset().mockImplementation(async () => savedTable);
  createSavedFilter.mockReset().mockImplementation(async (input: Omit<SavedFilter, 'id' | 'user_id' | 'created_at'>) => {
    const row = stored(input);
    savedTable = [...savedTable, row];
    return row;
  });
});

const renderList = () => renderRoutes({ '/applications': ApplicationsScreen }, '/applications');

const openBuilder = async () => {
  const toggle = await screen.findByRole('button', { name: 'New filter' });
  await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
  return toggle;
};

describe('filter builder', () => {
  it('builds and saves a filter by keyboard alone, and opens it as the active tab', async () => {
    const { user, router, container } = renderList();
    const toggle = await openBuilder();
    toggle.focus();
    await user.keyboard('{Enter}');

    const builder = await screen.findByRole('region', { name: 'New filter' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Focus lands on the first field.
    expect(document.activeElement).toBe(within(builder).getByRole('textbox', { name: 'Name' }));
    expect((await axe.run(container)).violations).toEqual([]);

    await user.keyboard('Warm leads');
    await user.tab();
    await user.keyboard('engineer');
    // Location, then the six status checkboxes: Interview is the second.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(within(builder).getByRole('checkbox', { name: 'Interview' }));
    await user.keyboard(' ');
    await user.tab();
    await user.keyboard(' ');
    // Past Offer, Rejected, and Withdrawn to Referral: the group is one stop, and arrows move the choice.
    for (let i = 0; i < 4; i += 1) await user.tab();
    const referral = within(within(builder).getByRole('group', { name: 'Referral' }));
    expect(document.activeElement).toBe(referral.getByRole('radio', { name: 'Any' }));
    await user.keyboard('{ArrowRight}');
    expect((referral.getByRole('radio', { name: 'Referral only' }) as HTMLInputElement).checked).toBe(true);

    // Starred, then Save filter.
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(within(builder).getByRole('button', { name: 'Save filter' }));
    await user.keyboard('{Enter}');

    await waitFor(() => expect(createSavedFilter).toHaveBeenCalled());
    expect(createSavedFilter).toHaveBeenCalledWith({
      name: 'Warm leads',
      statuses: ['Interview', 'Callback'],
      referral: 'yes',
      starred: 'any',
      location: null,
      text: 'engineer',
    });
    // Northwind: a Callback, through a referral, with "Engineer" in its position.
    const tab = await screen.findByRole('button', { name: 'Warm leads (1)' });
    expect(tab.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('region', { name: 'New filter' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New filter' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: savedTable.at(-1)!.id }));
  });

  it('names a blank filter one past the highest Custom N, and says so first', async () => {
    const { user } = renderList();
    await user.click(await openBuilder());
    const builder = await screen.findByRole('region', { name: 'New filter' });
    expect(within(builder).getByText('Optional. Left blank, it is called Custom 3.')).toBeTruthy();

    await user.click(within(builder).getByRole('button', { name: 'Save filter' }));
    expect(createSavedFilter).toHaveBeenCalledWith(expect.objectContaining({ name: 'Custom 3', text: null }));
    expect(await screen.findByRole('button', { name: 'Custom 3 (3)' })).toBeTruthy();
  });

  it('offers Any location and each place already used, once', async () => {
    const { user } = renderList();
    await user.click(await openBuilder());
    const builder = await screen.findByRole('region', { name: 'New filter' });
    await user.click(within(builder).getByRole('combobox', { name: 'Location' }));
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(options).toEqual(['Any location', 'Austin, TX', 'Remote']);

    await user.click(screen.getByRole('option', { name: 'Austin, TX' }));
    await user.click(within(builder).getByRole('button', { name: 'Save filter' }));
    expect(createSavedFilter).toHaveBeenCalledWith(expect.objectContaining({ location: 'Austin, TX' }));
    expect(await screen.findByRole('button', { name: 'Custom 3 (2)' })).toBeTruthy();
  });

  it('keeps every choice when the save fails, with a reference (§8.2)', async () => {
    createSavedFilter.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '23514' }));
    const { user } = renderList();
    await user.click(await openBuilder());
    const builder = await screen.findByRole('region', { name: 'New filter' });
    await user.type(within(builder).getByRole('textbox', { name: 'Name' }), 'Warm leads');
    await user.click(within(builder).getByRole('checkbox', { name: 'Offer' }));
    await user.click(within(builder).getByRole('button', { name: 'Save filter' }));

    const alert = await within(builder).findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save the filter.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect((within(builder).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Warm leads');
    expect((within(builder).getByRole('checkbox', { name: 'Offer' }) as HTMLInputElement).checked).toBe(true);

    await user.click(within(builder).getByRole('button', { name: 'Save filter' }));
    expect(await screen.findByRole('button', { name: 'Warm leads (0)' })).toBeTruthy();
  });

  it('asks the user to wait, without a reference, over the write limit', async () => {
    createSavedFilter.mockRejectedValueOnce(new WriteRateLimitedError());
    const { user } = renderList();
    await user.click(await openBuilder());
    const builder = await screen.findByRole('region', { name: 'New filter' });
    await user.click(within(builder).getByRole('button', { name: 'Save filter' }));

    const alert = await within(builder).findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save the filter. You've made a lot of changes in the last minute.");
    expect(alert.textContent).not.toContain('Error reference');
  });

  it('closes on Cancel without saving, and returns focus to + Filter', async () => {
    const { user } = renderList();
    await user.click(await openBuilder());
    await user.click(within(await screen.findByRole('region', { name: 'New filter' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'New filter' })).toBeNull();
    expect(createSavedFilter).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New filter' }));
  });

  it('waits for saved filters before + Filter can open', async () => {
    listSavedFilters.mockReturnValue(new Promise(() => {}));
    renderList();
    const toggle = (await screen.findByRole('button', { name: 'New filter' })) as HTMLButtonElement;
    await screen.findByRole('button', { name: 'All (3)' });
    expect(toggle.disabled).toBe(true);
  });
});
