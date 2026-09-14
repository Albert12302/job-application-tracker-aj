import { useNavigate, useSearch } from '@tanstack/react-router';
import { ALL_FILTER } from '@/domain/filters';
import { applicationsSearchSchema, type ApplicationsSearch } from '@/domain/schemas';

/**
 * The list's filter and search, read from and written to the URL (CLAUDE.md:
 * route state lives in search params), so a filtered list is linkable and
 * survives a reload. Parsed here as well as by the route, so it reads the same
 * inside a test router that has no validateSearch.
 *
 * Every change goes back to page 1 (§4.2). Typing replaces the history entry
 * rather than adding one per keystroke; choosing a tab adds one.
 */
export function useListFilters() {
  const search = applicationsSearchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();

  const update = (patch: Partial<ApplicationsSearch>, replace: boolean) =>
    void navigate({ to: '/applications', search: { ...search, ...patch, page: 1 }, replace });

  return {
    filter: search.filter,
    query: search.q,
    setFilter: (filter: string) => update({ filter }, false),
    /** A fallback the user did not choose — the active saved filter was deleted (§9.5). */
    replaceFilter: (filter: string) => update({ filter }, true),
    setQuery: (q: string) => update({ q }, true),
    clear: () => update({ filter: ALL_FILTER, q: '' }, false),
  };
}
