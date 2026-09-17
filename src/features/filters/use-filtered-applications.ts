import { useMemo } from 'react';
import {
  filterParam,
  namesSavedFilter,
  resolveFilter,
  tabCounts,
  visibleApplications,
} from '@/domain/filters';
import { sortApplications } from '@/domain/order';
import { pageWindow } from '@/domain/pagination';
import type { Application } from '@/domain/schemas';
import { useApplications } from '@/queries/use-applications';
import { useSavedFilters } from '@/queries/use-saved-filters';
import type { SavedFiltersState } from './FilterTabs';
import { useListFilters } from './use-list-filters';

const NONE: Application[] = [];

/**
 * Everything the list shows, from the URL and the two queries: the rows the
 * active filter and search let through (§5.1), in the chosen order, cut to the
 * current page (§4.2); and the tab counts over the whole set (§5.3).
 *
 * All of it happens here, over every application, rather than in the database:
 * every saved filter's count needs the whole set anyway, and one matching rule
 * in domain/filters.ts means a tab's count, the range's "of n", and the rows can
 * never disagree. If loading every application ever gets slow, this hook is the
 * one place that would ask the database for a page instead (SPEC §14, 2026-09-14).
 */
export function useFilteredApplications() {
  const url = useListFilters();
  const applications = useApplications();
  const savedFilters = useSavedFilters();

  const all = applications.data ?? NONE;
  const active = useMemo(() => resolveFilter(url.filter, savedFilters.data), [url.filter, savedFilters.data]);
  const sorted = useMemo(() => sortApplications(all, url.sort), [all, url.sort]);
  /** Every row the filter and search let through, across all pages — the range's n. */
  const matched = useMemo(() => visibleApplications(sorted, active, url.query), [sorted, active, url.query]);
  const paging = pageWindow(matched.length, url.page, url.pageSize);
  const rows = useMemo(() => matched.slice(paging.start, paging.end), [matched, paging.start, paging.end]);
  // Over the whole set, so a search keystroke never needs them again (§5.3).
  const loaded = applications.isSuccess;
  const counts = useMemo(
    () => (loaded ? tabCounts(all, savedFilters.data ?? []) : null),
    [loaded, all, savedFilters.data],
  );

  // Once loaded, a failed background refetch keeps the filters it already has: they still
  // narrow the list and feed the counts, so their tabs must stay too. Only a first load that
  // failed shows the error.
  let saved: SavedFiltersState;
  if (savedFilters.data) saved = { status: 'success', filters: savedFilters.data };
  else if (savedFilters.isError)
    saved = { status: 'error', retrying: savedFilters.isFetching, onRetry: () => void savedFilters.refetch() };
  else saved = { status: 'pending' };

  return {
    url,
    applications,
    all,
    active,
    /** The active tab's URL value — All when the URL names a saved filter that is not there. */
    activeParam: filterParam(active),
    matched,
    /** The page shown — the URL's, pulled back inside the pages there are. */
    paging,
    /** The rows on the current page: all that is on screen, and all that can be selected (§4.2). */
    rows,
    counts,
    saved,
    /** A link to a saved filter waits for saved filters, rather than flashing All first. */
    waiting: namesSavedFilter(url.filter) && savedFilters.isPending,
    /** Whether anything narrows the list. A search of only spaces does not. */
    narrowed: active.kind !== 'all' || url.query.trim() !== '',
  };
}
