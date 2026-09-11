import { supabase } from './client';

/**
 * app_errors, insert-only (SPEC §7.7). Only services/report-error.ts calls
 * this. No user_id: the column defaults to auth.uid(). Before sign-in there is
 * no insert policy, so a pre-auth report is dropped — the Auth and edge logs
 * cover that window.
 */
export async function insertAppError(row: {
  id: string;
  message: string;
  stack: string | null;
  route: string;
  release: string | null;
  user_agent: string;
}): Promise<void> {
  const { error } = await supabase.from('app_errors').insert(row);
  if (error) throw error;
}
