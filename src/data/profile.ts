import { profileSchema, type Profile } from '@/domain/schemas';
import { supabase } from './client';
import { writeFailure } from './write-limit';

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
 * Set what the app calls the user, or clear it (§4.6). An empty name arrives
 * here as null: the column's "no name chosen", which `displayName()` answers
 * with the email-derived one.
 *
 * Insert-if-missing for the same reason as `setAvatarPath` below — the row comes
 * from an auth trigger, and a missing one should not make the name unsettable.
 * No guard on the current value, though: unlike the photo, nothing outside the
 * row depends on what it held, so there is no orphan to avoid and the last
 * write wins. A 23505 from the insert means a row appeared in between, which
 * the user retries; it is not worth a second round trip to distinguish.
 *
 * The name is the user's own text, so it is never logged (§7.7) — the caller
 * reports the action alone.
 */
export async function setName(userId: string, name: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ name })
    .eq('id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw writeFailure(error);
  if (data) return;

  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, name });
  if (insertError) throw writeFailure(insertError);
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
  if (error) throw writeFailure(error);
  if (data) return;
  if (current !== null) throw new AvatarChangedError();

  const { error: insertError } = await supabase.from('profiles').insert({ id: userId, avatar_path: next });
  if (insertError?.code === '23505') throw new AvatarChangedError();
  if (insertError) throw writeFailure(insertError);
}
