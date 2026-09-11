import type { Application } from './schemas';

type Dated = Pick<Application, 'date_applied' | 'created_at'>;

/**
 * The list's default order (SPEC §5.3): date applied, newest first, and within
 * one day the most recently added first. The database sorts the same way
 * (data/applications.ts); this is for placing a row in an already-loaded list.
 */
export function newestFirst(a: Dated, b: Dated): number {
  return Date.parse(b.date_applied) - Date.parse(a.date_applied) || Date.parse(b.created_at) - Date.parse(a.created_at);
}
