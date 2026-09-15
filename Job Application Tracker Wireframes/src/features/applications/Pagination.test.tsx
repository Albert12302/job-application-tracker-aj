import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sortApplications } from '@/domain/order';
import type { Application } from '@/domain/schemas';
import { applicationRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { ApplicationDetailScreen } from './ApplicationDetailScreen';
import { ApplicationsScreen } from './ApplicationsScreen';

/**
 * Sort and pagination on the real list screen (SPEC §4.2, §5.3, §10.4, §11).
 * Only the data modules' network calls are stubs.
 */
const listApplications = vi.fn();

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
  listApplications: (...args: unknown[]) => listApplications(...args),
  getApplication: async (id: string) => TWENTY_THREE.find((row) => row.id === id) ?? null,
}));

vi.mock('@/data/saved-filters', () => ({
  listSavedFilters: async () => [],
}));

vi.mock('@/data/notes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/notes')>()),
  listNotes: async () => [],
}));

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 23 applications, Company 01 the newest (applied 2026-09-23) to Company 23 the oldest
 * (2026-09-01) — the 1st of a month, where a date read in local time would slip into August
 * west of Greenwich. Every third one is an Interview.
 */
const TWENTY_THREE: Application[] = Array.from({ length: 23 }, (_, i) =>
  applicationRow({
    company: `Company ${pad(i + 1)}`,
    date_applied: `2026-09-${pad(23 - i)}T00:00:00+00:00`,
    status: i % 3 === 0 ? 'Interview' : 'Applied',
  }),
);
const names = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `Company ${pad(from + i)}`);

const renderList = (path = '/applications') => renderRoutes({ '/applications': ApplicationsScreen }, path);

/** The companies on screen, in order: the table's links, or the cards'. */
const rowNames = () => {
  const list = screen.queryByRole('table') ?? screen.queryByRole('list', { name: /^Your applications/ });
  return list ? within(list).queryAllByRole('link').map((link) => link.textContent) : [];
};

const pages = () => screen.getByRole('navigation', { name: 'Pages' });
const statusText = () => screen.getAllByRole('status').map((region) => region.textContent);

/** The list's URL state as the router holds it. */
const searchOf = (router: { state: { location: { search: unknown } } }) => router.state.location.search as Record<string, unknown>;

const mockPhone = () =>
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }),
  });

beforeEach(() => {
  listApplications.mockReset().mockResolvedValue(TWENTY_THREE);
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  vi.restoreAllMocks();
});

describe('pagination (§4.2)', () => {
  it('shows ten rows, newest first, with the range over the whole set and page 1 marked current', async () => {
    const { container } = renderList();
    await waitFor(() => expect(rowNames()).toEqual(names(1, 10)));

    expect(screen.getByText('1–10 of 23')).toBeTruthy();
    const nav = within(pages());
    expect(nav.getByRole('link', { name: 'Page 1' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getAllByRole('link').filter((link) => link.getAttribute('aria-current'))).toHaveLength(1);
    expect(nav.getByRole('link', { name: 'Page 3' })).toBeTruthy();
    // Nowhere to go back to: still read as a link, but unavailable and not a tab stop.
    const previous = nav.getByRole('link', { name: 'Previous' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(previous.hasAttribute('href')).toBe(false);
    expect(nav.getByRole('link', { name: 'Next' }).getAttribute('href')).toContain('page=2');
    expect(screen.getByRole('columnheader', { name: /Date/ }).getAttribute('aria-sort')).toBe('descending');
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('goes to the next page and to a numbered one, reading each from its start', async () => {
    const { user, router, container } = renderList();
    await waitFor(() => expect(rowNames()).toEqual(names(1, 10)));
    await user.click(within(pages()).getByRole('link', { name: 'Next' }));

    await waitFor(() => expect(rowNames()).toEqual(names(11, 20)));
    expect(searchOf(router)).toMatchObject({ page: 2 });
    expect(screen.getByText('11–20 of 23')).toBeTruthy();
    // Focus lands on the new page, whose name says which page it is (§10.4).
    const table = screen.getByRole('table', { name: 'Your applications, newest first, page 2 of 3' });
    await waitFor(() => expect(document.activeElement).toBe(table));
    expect(statusText()).toContain('Showing 11 to 20 of 23 applications.');
    expect(within(pages()).getByRole('link', { name: 'Page 2' }).getAttribute('aria-current')).toBe('page');
    expect((await axe.run(container)).violations).toEqual([]);

    await user.click(within(pages()).getByRole('link', { name: 'Page 3' }));
    await waitFor(() => expect(rowNames()).toEqual(names(21, 23)));
    expect(screen.getByText('21–23 of 23')).toBeTruthy();
    expect(within(pages()).getByRole('link', { name: 'Next' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(pages()).getByRole('link', { name: 'Previous' }).getAttribute('href')).toContain('page=2');
  });

  it('never repeats or loses a row across pages when many share a date', async () => {
    // Twelve on one day, all added in the same moment: only the id orders them, across the
    // boundary between page 1 and page 2.
    const tied = Array.from({ length: 23 }, (_, i) =>
      applicationRow({
        company: `Tied ${pad(i + 1)}`,
        date_applied: i < 12 ? '2026-09-10T00:00:00+00:00' : `2026-08-${pad(20 - i + 12)}T00:00:00+00:00`,
        created_at: '2026-09-11T08:00:00+00:00',
      }),
    );
    listApplications.mockResolvedValue(tied);
    const { user } = renderList();
    await waitFor(() => expect(rowNames()).toHaveLength(10));

    const seen = [...rowNames()];
    for (const page of [2, 3]) {
      await user.click(within(pages()).getByRole('link', { name: `Page ${page}` }));
      await waitFor(() => expect(screen.getByRole('link', { name: `Page ${page}` }).getAttribute('aria-current')).toBe('page'));
      seen.push(...rowNames());
    }
    expect(seen).toEqual(sortApplications(tied, 'date-desc').map((row) => row.company));
    expect(new Set(seen).size).toBe(23);
  });

  it('changes rows per page, back to page 1', async () => {
    const { user, router } = renderList('/applications?page=2');
    await waitFor(() => expect(rowNames()).toEqual(names(11, 20)));

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    await user.click(await screen.findByRole('option', { name: '25' }));

    await waitFor(() => expect(rowNames()).toEqual(names(1, 23)));
    expect(searchOf(router)).toMatchObject({ page: 1, pageSize: 25 });
    expect(screen.getByText('1–23 of 23')).toBeTruthy();
    expect(within(pages()).queryByRole('link', { name: 'Page 2' })).toBeNull();
  });

  it('goes back to page 1 when the filter or the search changes, and counts the whole filtered set', async () => {
    const { user, router } = renderList('/applications?page=3');
    await waitFor(() => expect(rowNames()).toEqual(names(21, 23)));

    const group = within(screen.getByRole('group', { name: 'Filter applications' }));
    await user.click(group.getByRole('button', { name: 'Interview (8)' }));
    await waitFor(() => expect(searchOf(router)).toMatchObject({ filter: 'Interview', page: 1 }));
    // Eight Interviews: one page, all of them, and the tabs still count all 23.
    expect(rowNames()).toHaveLength(8);
    expect(screen.getByText('1–8 of 8')).toBeTruthy();
    expect(group.getByRole('button', { name: 'All (23)' })).toBeTruthy();

    await user.click(group.getByRole('button', { name: 'All (23)' }));
    await waitFor(() => expect(rowNames()).toEqual(names(1, 10)));
    await user.click(within(pages()).getByRole('link', { name: 'Page 3' }));
    await waitFor(() => expect(searchOf(router)).toMatchObject({ page: 3 }));
    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'Company 1');
    await waitFor(() => expect(searchOf(router)).toMatchObject({ q: 'Company 1', page: 1 }));
    // Company 10–19 — page 3 would have been empty, and n is the matches, not the 23.
    await waitFor(() => expect(rowNames()).toEqual(names(10, 19)));
    expect(screen.getByText('1–10 of 10')).toBeTruthy();
  });

  it('shows the last page for a page past the end, and corrects the URL', async () => {
    const { router } = renderList('/applications?page=9');
    await waitFor(() => expect(rowNames()).toEqual(names(21, 23)));
    await waitFor(() => expect(searchOf(router)).toMatchObject({ page: 3 }));
    expect(within(pages()).getByRole('link', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page');
  });

  it('hides pagination in the empty state, and shows it disabled with no range while loading (§8.2)', async () => {
    listApplications.mockReturnValue(new Promise(() => {}));
    const loading = renderList();
    const size = await screen.findByRole('combobox', { name: 'Rows per page' });
    expect(size.hasAttribute('disabled') || size.getAttribute('aria-disabled') === 'true' || size.hasAttribute('data-disabled')).toBe(true);
    expect(screen.queryByText(/ of \d+$/)).toBeNull();
    expect(within(pages()).getByRole('link', { name: 'Next' }).getAttribute('aria-disabled')).toBe('true');
    loading.unmount();

    listApplications.mockReset().mockResolvedValue([]);
    renderList();
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });
});

describe('selection across pages (§4.2)', () => {
  it('selects all on this page only, and a change of page clears it', async () => {
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select all applications' }));
    expect(screen.getByRole('button', { name: 'Delete 10 applications' })).toBeTruthy();

    await user.click(within(pages()).getByRole('link', { name: 'Next' }));
    await waitFor(() => expect(rowNames()).toEqual(names(11, 20)));
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select all applications' }).getAttribute('aria-checked')).toBe('false');
  });
});

describe('sort (§4.2, §5.3)', () => {
  it('flips to oldest first from the date header, back to page 1, and says so', async () => {
    const { user, router } = renderList('/applications?page=2');
    await waitFor(() => expect(rowNames()).toEqual(names(11, 20)));

    await user.click(screen.getByRole('button', { name: 'Date, show oldest first' }));
    await waitFor(() => expect(rowNames()).toEqual(names(14, 23).reverse()));
    expect(searchOf(router)).toMatchObject({ sort: 'date-asc', page: 1 });
    expect(screen.getByRole('columnheader', { name: /Date/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(statusText()).toContain('Sorted oldest first.');
    // The button stays where focus is, now offering the other way.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Date, show newest first' }));
  });

  it('clears the selection when the order changes', async () => {
    const { user } = renderList();
    await user.click(await screen.findByRole('checkbox', { name: 'Select Company 01' }));
    await user.click(screen.getByRole('button', { name: 'Date, show oldest first' }));
    await waitFor(() => expect(rowNames()[0]).toBe('Company 23'));
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
  });
});

describe('below 760px (§11)', () => {
  it('hides the numbered pages, keeps Previous, Next and the range, and makes sort its own control', async () => {
    mockPhone();
    const { user, container } = renderList();
    await waitFor(() => expect(rowNames()).toEqual(names(1, 10)));

    expect(within(pages()).queryByRole('link', { name: 'Page 1' })).toBeNull();
    expect(within(pages()).getByRole('link', { name: 'Next' })).toBeTruthy();
    expect(screen.getByText('1–10 of 23')).toBeTruthy();
    expect(screen.queryByRole('columnheader')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Sort by date: Newest first' }));
    await waitFor(() => expect(rowNames()).toEqual(names(14, 23).reverse()));
    expect(screen.getByRole('button', { name: 'Sort by date: Oldest first' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Your applications, oldest first, page 1 of 3' })).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe('coming back from an application (§4.2)', () => {
  it('returns to the list as it was left: the same search, order, and page', async () => {
    const { user, router } = renderRoutes(
      { '/applications': ApplicationsScreen, '/applications/$id': ApplicationDetailScreen },
      '/applications?sort=date-asc&page=2&q=Company',
    );
    await waitFor(() => expect(rowNames()).toEqual(names(4, 13).reverse()));

    await user.click(screen.getByRole('link', { name: 'Company 08' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Company 08' })).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'Back to applications' }));
    await waitFor(() => expect(rowNames()).toEqual(names(4, 13).reverse()));
    expect(searchOf(router)).toMatchObject({ sort: 'date-asc', page: 2, q: 'Company' });
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveProperty('value', 'Company');
  });
});

describe('Jump to bottom (§4.2)', () => {
  it('shows while there is far to scroll, and takes the view and focus to the pagination', async () => {
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2400);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { user } = renderList();
    await waitFor(() => expect(rowNames()).toHaveLength(10));

    await user.click(screen.getByRole('button', { name: 'Jump to bottom' }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 2400 }));
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Pagination' }));
  });

  it('is not there when the bottom is near', async () => {
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(760);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700);
    renderList();
    await waitFor(() => expect(rowNames()).toHaveLength(10));
    expect(screen.queryByRole('button', { name: 'Jump to bottom' })).toBeNull();
  });
});
