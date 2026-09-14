import type { Application, SavedFilter, SavedFilterFormValues, TriState } from './schemas';
import { STATUSES, type Status } from './status';

/**
 * Filtering the dashboard (SPEC §4.2, §5.1). Pure: the list screen hands in
 * every application and the URL's `filter` and `q`, and gets back what to show
 * and what each tab counts.
 */

/** What a saved filter tests (§2, §5.1) — a row's criteria, without its identity. */
export type FilterCriteria = Pick<SavedFilter, 'statuses' | 'referral' | 'starred' | 'location' | 'text'>;

/** The fields filtering reads. */
export type Filterable = Pick<
  Application,
  'company' | 'position' | 'location' | 'description' | 'status' | 'referral' | 'starred'
>;

/**
 * True when `term` is inside any one of `fields`, ignoring case and the term's
 * outer spaces. An empty term matches everything. Fields are tested one at a
 * time, never joined, so a term cannot match across the seam of two fields
 * ("osoProd" does not find Contoso / Product Engineer).
 */
export function containsText(fields: readonly (string | null)[], term: string | null): boolean {
  const needle = (term ?? '').trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field !== null && field.toLowerCase().includes(needle));
}

function matchesTriState(value: boolean, wanted: TriState): boolean {
  return wanted === 'any' || (wanted === 'yes') === value;
}

/** §5.1: an application matches a saved filter when all five tests pass. */
export function matchesFilter(application: Filterable, criteria: FilterCriteria): boolean {
  return (
    (criteria.statuses.length === 0 || criteria.statuses.includes(application.status)) &&
    matchesTriState(application.referral, criteria.referral) &&
    matchesTriState(application.starred, criteria.starred) &&
    (criteria.location === null || application.location === criteria.location) &&
    containsText([application.company, application.position, application.location, application.description], criteria.text)
  );
}

/** §5.1: the search box matches company, position, and location only — never the description. */
export function matchesSearch(application: Filterable, query: string): boolean {
  return containsText([application.company, application.position, application.location], query);
}

/** The tab in effect. */
export type ActiveFilter =
  | { kind: 'all' }
  | { kind: 'status'; status: Status }
  | { kind: 'saved'; filter: SavedFilter };

export const ALL_FILTER = 'all';

function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

/**
 * Whether the URL's `filter` names a saved filter — anything that is not All or
 * a status. The list waits for saved filters only then.
 */
export function namesSavedFilter(param: string): boolean {
  return param !== ALL_FILTER && !isStatus(param);
}

/**
 * The URL's `filter` as a tab. A saved filter that is not among `saved` —
 * deleted, another user's link, or saved filters that could not load — is All.
 */
export function resolveFilter(param: string, saved: readonly SavedFilter[] | undefined): ActiveFilter {
  if (param === ALL_FILTER) return { kind: 'all' };
  if (isStatus(param)) return { kind: 'status', status: param };
  const filter = saved?.find((candidate) => candidate.id === param);
  return filter ? { kind: 'saved', filter } : { kind: 'all' };
}

/** The URL value for a tab. */
export function filterParam(active: ActiveFilter): string {
  if (active.kind === 'status') return active.status;
  if (active.kind === 'saved') return active.filter.id;
  return ALL_FILTER;
}

function matchesActive(application: Filterable, active: ActiveFilter): boolean {
  if (active.kind === 'status') return application.status === active.status;
  if (active.kind === 'saved') return matchesFilter(application, active.filter);
  return true;
}

/** The rows to show: the active filter, then the search on top of it (§5.1). Order is kept. */
export function visibleApplications<T extends Filterable>(
  applications: readonly T[],
  active: ActiveFilter,
  query: string,
): T[] {
  return applications.filter((application) => matchesActive(application, active) && matchesSearch(application, query));
}

/**
 * Tab counts (§4.2, §5.3): All, each status, and each saved filter, over the
 * whole set — never narrowed by the search.
 */
export type TabCounts = {
  all: number;
  byStatus: Record<Status, number>;
  bySavedFilter: Record<string, number>;
};

export function tabCounts(applications: readonly Filterable[], saved: readonly SavedFilter[]): TabCounts {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
  for (const application of applications) byStatus[application.status] += 1;
  const bySavedFilter = Object.fromEntries(
    saved.map((filter) => [filter.id, applications.filter((application) => matchesFilter(application, filter)).length]),
  );
  return { all: applications.length, byStatus, bySavedFilter };
}

const CUSTOM_NAME = /^Custom (\d{1,9})$/;

/**
 * The name for a filter saved without one (§2): one more than the highest
 * "Custom N" already in use, so a number never comes back after a delete while
 * a later one still exists. Counting filters instead would repeat names.
 */
export function nextCustomName(existingNames: readonly string[]): string {
  let highest = 0;
  for (const name of existingNames) {
    const match = CUSTOM_NAME.exec(name.trim());
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `Custom ${highest + 1}`;
}

/**
 * A saved filter as it is written (§2): a blank name becomes "Custom N", a blank text match
 * null, and every status ticked is stored as the empty list that means all statuses.
 */
export function savedFilterInput(
  values: SavedFilterFormValues,
  existingNames: readonly string[],
): FilterCriteria & { name: string } {
  const name = values.name.trim();
  const text = values.text.trim();
  const statuses = STATUSES.filter((status) => values.statuses.includes(status));
  return {
    name: name || nextCustomName(existingNames),
    statuses: statuses.length === STATUSES.length ? [] : statuses,
    referral: values.referral,
    starred: values.starred,
    location: values.location,
    text: text || null,
  };
}

/** How the "No matches" state names what is in effect (§8.2). Null for All. */
export function filterLabel(active: ActiveFilter): string | null {
  if (active.kind === 'status') return active.status;
  if (active.kind === 'saved') return active.filter.name;
  return null;
}

/** §8.2 "No matches": the line naming the active filter and search. */
export function noMatchesMessage(active: ActiveFilter, query: string): string {
  const label = filterLabel(active);
  const term = query.trim();
  if (label && term) return `No applications in ${label} match "${term}".`;
  if (label) return `No applications in ${label}.`;
  return `No applications match "${term}".`;
}
