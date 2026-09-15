import type { Application, ApplicationsSearch } from './schemas';

type Ordered = Pick<Application, 'id' | 'date_applied' | 'created_at'>;

/** The list's two orders (§4.2), as the URL spells them. */
export type ListSort = ApplicationsSearch['sort'];

/**
 * The list's default order (SPEC §5.3): date applied, newest first; within one
 * day the most recently added first; then by id, so no two rows ever tie. The
 * pages are cut from this order in the browser (§4.2), so a total order is what
 * keeps a row from repeating or going missing between pages.
 *
 * Dates compare as moments, and date_applied is UTC midnight (§5.4), so the
 * order is the same in every time zone.
 */
export function newestFirst(a: Ordered, b: Ordered): number {
  return (
    Date.parse(b.date_applied) - Date.parse(a.date_applied) ||
    Date.parse(b.created_at) - Date.parse(a.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** "Oldest first" is newest first read backwards, so one order's last page is the other's first. */
export function oldestFirst(a: Ordered, b: Ordered): number {
  return newestFirst(b, a);
}

/** The applications in the chosen order, as a new array. */
export function sortApplications<T extends Ordered>(applications: readonly T[], sort: ListSort): T[] {
  return [...applications].sort(sort === 'date-asc' ? oldestFirst : newestFirst);
}

/** How the order is named where it is a control of its own (§11). */
export function sortLabel(sort: ListSort): string {
  return sort === 'date-asc' ? 'Oldest first' : 'Newest first';
}
