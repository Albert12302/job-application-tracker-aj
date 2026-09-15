import { useNavigate, useSearch } from '@tanstack/react-router';
import { ALL_FILTER } from '@/domain/filters';
import type { PageSize } from '@/domain/pagination';
import { applicationsSearchSchema, type ApplicationsSearch } from '@/domain/schemas';

/**
 * The list's URL state — filter, search, sort, page, and page size — read from
 * and written to search params (CLAUDE.md), so a list is linkable and survives
 * a reload. Parsed here as well as by the route, so it reads the same inside a
 * test router that has no validateSearch.
 *
 * Changing the filter, the search, the sort, or the page size goes back to page
 * 1 (§4.2). Typing replaces the history entry rather than adding one per
 * keystroke; every other choice adds one, so Back undoes it. Changes made below
 * the top of the page keep the scroll where it is: the router would otherwise
 * jump to the top, away from the control just used.
 */
export function useListFilters() {
  const search = applicationsSearchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();

  const go = (next: ApplicationsSearch, replace: boolean) =>
    void navigate({ to: '/applications', search: next, replace, resetScroll: false });
  const update = (patch: Partial<ApplicationsSearch>, replace: boolean) => go({ ...search, ...patch, page: 1 }, replace);

  return {
    search,
    filter: search.filter,
    query: search.q,
    sort: search.sort,
    page: search.page,
    pageSize: search.pageSize,
    setFilter: (filter: string) => update({ filter }, false),
    /** A fallback the user did not choose — the active saved filter was deleted (§9.5). */
    replaceFilter: (filter: string) => update({ filter }, true),
    setQuery: (q: string) => update({ q }, true),
    clear: () => update({ filter: ALL_FILTER, q: '' }, false),
    toggleSort: () => update({ sort: search.sort === 'date-asc' ? 'date-desc' : 'date-asc' }, false),
    setPageSize: (pageSize: PageSize) => update({ pageSize }, false),
    /** The URL state for a link to `page`: Previous, Next, and the numbers. */
    pageSearch: (page: number): ApplicationsSearch => ({ ...search, page }),
    /** A page past the end becomes the last page, in place — nobody chose the stale one. */
    correctPage: (page: number) => go({ ...search, page }, true),
  };
}
