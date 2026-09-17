import type { FilterCriteria } from '@/domain/filters';
import { savedFilterSchema, type SavedFilter } from '@/domain/schemas';
import { supabase } from './client';
import { writeFailure } from './write-limit';

/**
 * Saved filters (SPEC §2, §9.5). RLS scopes every call to the signed-in user
 * (§7.2); user_id defaults to auth.uid() and is never sent. Renaming and editing
 * are out of scope for v1, so there is no update.
 */

/** Tab order is creation order (§2); id breaks a tie. */
export async function listSavedFilters(userId: string): Promise<SavedFilter[]> {
  const { data, error } = await supabase
    .from('saved_filters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return savedFilterSchema.array().parse(data);
}

export async function createSavedFilter(input: FilterCriteria & { name: string }): Promise<SavedFilter> {
  const { data, error } = await supabase.from('saved_filters').insert(input).select('*').single();
  if (error) throw writeFailure(error);
  return savedFilterSchema.parse(data);
}

/** Already gone counts as done: the user wanted it deleted, and it is. */
export async function deleteSavedFilter(id: string): Promise<void> {
  const { error } = await supabase.from('saved_filters').delete().eq('id', id);
  if (error) throw writeFailure(error);
}
