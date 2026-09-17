import { profileSchema, type Profile } from '@/domain/schemas';
import { supabase } from './client';

/** Null when the row is missing — the name then falls back to the email (domain/profile.ts). */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? profileSchema.parse(data) : null;
}

/**
 * The profile no longer held the photo a change started from — another tab
 * replaced or removed it first.
 */
export class AvatarChangedError extends Error {
  constructor() {
    super('avatar_changed');
    this.name = 'AvatarChangedError';
  }
}

/**
 * Point the profile at a new photo, or at none (§4.6, §9.4).
 *
 * Only if it still holds `current`: the caller deletes `current`'s object once
 * this commits, so the write has to be the one that actually let go of it. Had
 * another tab swapped the photo in the meantime, an unguarded write would leave
 * that tab's photo orphaned and this one would delete a file nothing replaced —
 * the same guard as `setCoverLetter`.
 *
 * The row comes from an auth trigger, and a missing one should not make a photo
 * impossible to set: with no photo expected and no row updated, it is inserted,
 * and an insert that finds a row after all means that row holds another photo.
 * RLS checks `id = auth.uid()` throughout, so `userId` is not trusted, only convenient.
 */
export async function setAvatarPath(userId: string, next: string | null, current: string | null): Promise<void> {
  const update = supabase.from('profiles').update({ avatar_path: next }).eq('id', userId);
  const guarded = current === null ? update.is('avatar_path', null) : update.eq('avatar_path', current);
  const { data, error } = await guarded.select('id').maybeSingle();
  if (error) throw error;
  if (data) return;
  if (current !== null) throw new AvatarChangedError();

  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, avatar_path: next });
  if (insertError?.code === '23505') throw new AvatarChangedError();
  if (insertError) throw insertError;
}
