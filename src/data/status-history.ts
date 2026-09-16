import { statusChangeSchema, type StatusChange } from '@/domain/schemas';
import { allPages } from './all-pages';
import { supabase } from './client';

/**
 * status_history, read only (SPEC §2). Rows are written by exactly two Postgres
 * functions — change_application_status and create_application — and never
 * from here: this module has no insert, and the table has no update or delete
 * policy.
 *
 * The table has no user_id; its select policy admits a row when the signed-in
 * user owns its application (§7.2), so this reads every row of theirs and
 * nobody else's.
 */

/** Every change to every one of the user's applications, oldest first (§4.5, §5.3). */
export async function listStatusHistory(): Promise<StatusChange[]> {
  const rows = await allPages((from, to) =>
    supabase
      .from('status_history')
      .select('application_id, to_status, changed_at')
      // id breaks ties, so the order is total and no row can slip between pages.
      .order('changed_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  return statusChangeSchema.array().parse(rows);
}
