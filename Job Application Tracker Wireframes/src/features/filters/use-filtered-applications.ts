import {
  filterParam,
  namesSavedFilter,
  resolveFilter,
  tabCounts,
  visibleApplications,
} from '@/domain/filters';
import type { Application } from '@/domain/schemas';
import { useApplications } from '@/queries/use-applications';
import { useSavedFilters } from '@/queries/use-saved-filters';
import type { SavedFiltersState } from './FilterTabs';
import { useListFilters } from './use-list-filters';

const NONE: Application[] = [];

/**
 * Everything the list shows, from the URL and the two queries: the rows the
 * active filter and search let through (§5.1), and the tab counts over the
 * whole set (§5.3). Filtering happens here, over every application, rather
 * than in the database — every saved filter's count needs the whole set anyway.
 */
export function useFilteredApplications() {
  const url = useListFilters();
  const applications = useApplications();
  const savedFilters = useSavedFilters();

  const all = applications.data ?? NONE;
  const active = resolveFilter(url.filter, savedFilters.data);
  const visible = visibleApplications(all, active, url.query);

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
    visible,
    counts: applications.isSuccess ? tabCounts(all, savedFilters.data ?? []) : null,
    saved,
    /** A link to a saved filter waits for saved filters, rather than flashing All first. */
    waiting: namesSavedFilter(url.filter) && savedFilters.isPending,
    /** Whether anything narrows the list. A search of only spaces does not. */
    narrowed: active.kind !== 'all' || url.query.trim() !== '',
  };
}
