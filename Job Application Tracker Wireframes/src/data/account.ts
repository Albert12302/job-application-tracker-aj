import { supabase } from './client';

/**
 * The account itself (SPEC §9.7).
 *
 * Deleting an auth.users row needs the service role, which the browser must
 * never hold (§7.4), so this calls the `delete-account` edge function — the
 * third and last place that key exists, beside `sign-in` and `upload`.
 *
 * Nothing is sent. The function reads whose account to delete from the token
 * Auth vouches for, so there is no id here for anyone to tamper with.
 */
export async function deleteAccountRow(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw error;
}
