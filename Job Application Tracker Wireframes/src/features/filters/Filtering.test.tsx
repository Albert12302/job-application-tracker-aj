import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedFilter } from '@/domain/schemas';
import { ApplicationsScreen } from '@/features/applications/ApplicationsScreen';
import { applicationRow, TEST_USER } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';

/**
 * Search, tabs, and saved filters on the real list screen (SPEC §4.2, §5.1,
 * §5.3, §8.2, §9.5). Only the data modules' network calls are stubs.
 */
const listApplications = vi.fn();
const listSavedFilters = vi.fn();
const deleteSavedFilter = vi.fn();

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
  listApplications: (...args: unknown[]) => listApplications(...args),
}));

vi.mock('@/data/saved-filters', () => ({
  listSavedFilters: (...args: unknown[]) => listSavedFilters(...args),
  deleteSavedFilter: (...args: unknown[]) => deleteSavedFilter(...args),
  createSavedFilter: vi.fn(),
}));

const NORTHWIND = applicationRow({
  company: 'Northwind Traders',
  position: 'Senior Frontend Engineer',
  location: 'Austin, TX',
  description: 'Design-system team.',
  status: 'Callback',
  referral: true,
  starred: true,
  date_applied: '2026-09-10T00:00:00+00:00',
});
const CONTOSO = applicationRow({
  company: 'Contoso',
  position: 'Product Engineer',
  location: 'Remote',
  description: 'Small team, Austin office optional.',
  status: 'Interview',
  date_applied: '2026-09-08T00:00:00+00:00',
});
const LITWARE = applicationRow({
  company: 'Litware',
  position: 'Senior Engineer',
  location: 'Seattle, WA',
  description: null,
  status: 'Applied',
  date_applied: '2026-09-06T00:00:00+00:00',
});
const EVERY = ['Northwind Traders', 'Contoso', 'Litware'];

const savedFilter = (overrides: Partial<SavedFilter>): SavedFilter => ({
  id: crypto.randomUUID(),
  user_id: TEST_USER.id,
  name: 'Live',
  statuses: [],
  referral: 'any',
  starred: 'any',
  location: null,
  text: null,
  created_at: '2026-09-01T10:00:00+00:00',
  ...overrides,
});

const LIVE = savedFilter({ name: 'Live', statuses: ['Interview', 'Callback', 'Offer'] });
const AUSTIN_REFERRALS = savedFilter({ name: 'Austin referrals', referral: 'yes', location: 'Austin, TX' });

const renderList = (path = '/applications') => renderRoutes({ '/applications': ApplicationsScreen }, path);

/** The tabs, once the router has rendered the screen. */
const findTabs = async () => within(await screen.findByRole('group', { name: 'Filter applications' }));
const tabs = () => within(screen.getByRole('group', { name: 'Filter applications' }));

/** Enabled once the list has loaded (§8.2). */
const findSearch = async () => {
  const search = (await screen.findByRole('searchbox', { name: 'Search' })) as HTMLInputElement;
  await waitFor(() => expect(search.disabled).toBe(false));
  return search;
};

/** The applications on screen, by the link each row's company is — none while the table is not there. */
const rowNames = () => {
  const table = screen.queryByRole('table');
  return table ? within(table).queryAllByRole('link').map((link) => link.textContent) : [];
};

const selectedText = () => screen.queryByText('1 selected', { selector: 'p:not([role])' });

/** What the stubbed database holds, so a refetch after a delete does not bring the filter back. */
let savedTable: SavedFilter[] = [];

beforeEach(() => {
  savedTable = [LIVE, AUSTIN_REFERRALS];
  listApplications.mockReset().mockResolvedValue([NORTHWIND, CONTOSO, LITWARE]);
  listSavedFilters.mockReset().mockImplementation(async () => savedTable);
  deleteSavedFilter.mockReset().mockImplementation(async (id: string) => {
    savedTable = savedTable.filter((filter) => filter.id !== id);
  });
});

describe('filter tabs', () => {
  it('counts All, every status, and every saved filter over the whole set', async () => {
    const { container } = renderList();
    const group = await findTabs();
    expect(await group.findByRole('button', { name: 'Live (2)' })).toBeTruthy();
    for (const name of ['All (3)', 'Applied (1)', 'Interview (1)', 'Callback (1)', 'Offer (0)', 'Rejected (0)', 'Withdrawn (0)']) {
      expect(group.getByRole('button', { name })).toBeTruthy();
    }
    expect(group.getByRole('button', { name: 'Austin referrals (1)' })).toBeTruthy();
    expect(group.getByRole('button', { name: 'All (3)' }).getAttribute('aria-pressed')).toBe('true');
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('shows the controls disabled, without counts, while the list loads (§8.2)', async () => {
    listApplications.mockReturnValue(new Promise(() => {}));
    renderList();
    const all = (await (await findTabs()).findByRole('button', { name: 'All' })) as HTMLButtonElement;
    expect(all.disabled).toBe(true);
    expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('narrows the list to a status, and puts it in the URL', async () => {
    const { user, router } = renderList();
    await user.click(await (await findTabs()).findByRole('button', { name: 'Interview (1)' }));
    await waitFor(() => expect(rowNames()).toEqual(['Contoso']));
    expect(router.state.location.search).toMatchObject({ filter: 'Interview' });
    expect(tabs().getByRole('button', { name: 'Interview (1)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('opens straight onto a linked saved filter, waiting for it rather than flashing All', async () => {
    let resolve: (filters: SavedFilter[]) => void = () => {};
    listSavedFilters.mockReturnValue(new Promise((done) => (resolve = done)));
    renderList(`/applications?filter=${LIVE.id}`);
    expect(await screen.findByText('Loading your applications')).toBeTruthy();
    expect(rowNames()).toEqual([]);

    resolve([LIVE]);
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders', 'Contoso']));
    expect(tabs().getByRole('button', { name: 'Live (2)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows All for a saved filter that does not exist', async () => {
    renderList(`/applications?filter=${crypto.randomUUID()}`);
    await waitFor(() => expect(rowNames()).toEqual(EVERY));
    expect(tabs().getByRole('button', { name: 'All (3)' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('search (§5.1)', () => {
  it('matches company, position, or location, ignoring case — never the description', async () => {
    const { user, router } = renderList();
    const search = await findSearch();

    await user.type(search, 'SENIOR');
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders', 'Litware']));
    expect(router.state.location.search).toMatchObject({ q: 'SENIOR' });

    await user.clear(search);
    await user.type(search, 'austin');
    // Contoso's description mentions Austin; the search does not read descriptions.
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders']));
    expect(search.value).toBe('austin');
  });

  it('applies on top of the active filter, and never changes the counts (§5.3)', async () => {
    const { user } = renderList('/applications?filter=Interview');
    await user.type(await findSearch(), 'northwind');

    expect(await screen.findByRole('heading', { name: 'No matches' })).toBeTruthy();
    expect(screen.getByText('No applications in Interview match "northwind".')).toBeTruthy();
    expect(tabs().getByRole('button', { name: 'All (3)' })).toBeTruthy();
    expect(tabs().getByRole('button', { name: 'Callback (1)' })).toBeTruthy();
  });

  it('announces how many applications are shown', async () => {
    const { user } = renderList();
    await user.type(await findSearch(), 'senior');
    await waitFor(() =>
      expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('Showing 2 of 3 applications.'),
    );
  });
});

describe('no matches (§8.2)', () => {
  it('names the filter and search, and Clear filters resets both', async () => {
    const { user, router, container } = renderList('/applications?filter=Offer&q=acme');
    expect(await screen.findByRole('heading', { name: 'No matches' })).toBeTruthy();
    expect(screen.getByText('No applications in Offer match "acme".')).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(rowNames()).toEqual(EVERY));
    expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).value).toBe('');
    expect(router.state.location.search).toMatchObject({ filter: 'all', q: '' });
  });

  it('says "No applications yet" when there are none, whatever the filter', async () => {
    listApplications.mockResolvedValue([]);
    renderList('/applications?filter=Offer&q=acme');
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No matches' })).toBeNull();
  });
});

describe('selection (§4.2)', () => {
  it('clears when the filter changes, even for a row still on screen', async () => {
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Contoso' }));
    expect(selectedText()).toBeTruthy();

    await user.click(tabs().getByRole('button', { name: 'Interview (1)' }));
    await waitFor(() => expect(rowNames()).toEqual(['Contoso']));
    expect(selectedText()).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Contoso' }).getAttribute('aria-checked')).toBe('false');
  });

  it('clears when the search changes', async () => {
    const { user } = renderList();
    const search = await findSearch();
    await user.click(screen.getByRole('checkbox', { name: 'Select Northwind Traders' }));
    expect(selectedText()).toBeTruthy();
    await user.type(search, 'north');
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders']));
    expect(selectedText()).toBeNull();
  });
});

describe('saved filters', () => {
  it('applies a saved filter by all its tests', async () => {
    const { user } = renderList();
    await user.click(await (await findTabs()).findByRole('button', { name: 'Austin referrals (1)' }));
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders']));
  });

  it('deletes at once, and the active one falls back to All (§9.5)', async () => {
    const { user, router } = renderList(`/applications?filter=${LIVE.id}`);
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders', 'Contoso']));

    await user.click(tabs().getByRole('button', { name: 'Delete saved filter Live' }));
    expect(deleteSavedFilter).toHaveBeenCalledWith(LIVE.id);
    await waitFor(() => expect(tabs().queryByRole('button', { name: /^Live/ })).toBeNull());
    await waitFor(() => expect(rowNames()).toEqual(EVERY));
    expect(router.state.location.search).toMatchObject({ filter: 'all' });
    expect(document.activeElement).toBe(tabs().getByRole('button', { name: 'All (3)' }));
  });

  it('keeps the current tab when another filter is deleted', async () => {
    const { user } = renderList('/applications?filter=Interview');
    await user.click(await (await findTabs()).findByRole('button', { name: 'Delete saved filter Austin referrals' }));
    await waitFor(() => expect(tabs().queryByRole('button', { name: /^Austin referrals/ })).toBeNull());
    expect(rowNames()).toEqual(['Contoso']);
  });

  it('puts the tab back when the delete fails', async () => {
    deleteSavedFilter.mockRejectedValue(new Error('network'));
    const { user } = renderList();
    await user.click(await (await findTabs()).findByRole('button', { name: 'Delete saved filter Live' }));
    await waitFor(() => expect(deleteSavedFilter).toHaveBeenCalled());
    expect(await tabs().findByRole('button', { name: 'Live (2)' })).toBeTruthy();
  });

  it('keeps the tabs it has when a later refetch fails, since they still filter the list', async () => {
    const { queryClient } = renderList(`/applications?filter=${LIVE.id}`);
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders', 'Contoso']));

    listSavedFilters.mockRejectedValue(new Error('network'));
    await queryClient.refetchQueries({ queryKey: ['saved-filters'] });
    await waitFor(() => expect(listSavedFilters).toHaveBeenCalledTimes(2));

    expect(tabs().getByRole('button', { name: 'Live (2)' }).getAttribute('aria-pressed')).toBe('true');
    expect((tabs().getByRole('button', { name: 'New filter' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Couldn't load your saved filters.")).toBeNull();
    expect(rowNames()).toEqual(['Northwind Traders', 'Contoso']);
  });

  it('says when there are none yet', async () => {
    listSavedFilters.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('No saved filters yet')).toBeTruthy();
  });

  it('falls back to the status tabs when they fail to load, without blocking the list', async () => {
    savedTable = [LIVE];
    listSavedFilters.mockRejectedValueOnce(new Error('network'));
    const { user } = renderList(`/applications?filter=${LIVE.id}`);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load your saved filters.");
    await waitFor(() => expect(rowNames()).toEqual(EVERY));
    expect(tabs().getByRole('button', { name: 'Interview (1)' })).toBeTruthy();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await tabs().findByRole('button', { name: 'Live (2)' })).toBeTruthy();
    await waitFor(() => expect(rowNames()).toEqual(['Northwind Traders', 'Contoso']));
  });
});
