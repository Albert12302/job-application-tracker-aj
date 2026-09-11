import { supabase } from './client';

/**
 * Applications. Step 1 needs only the count on the profile screen (SPEC §4.6);
 * list / get / create / update / remove arrive with step 2.
 */

export async function countApplications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    // RLS already scopes this; the filter keeps the query honest if a policy ever regresses.
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}
