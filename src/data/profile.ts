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
 * Upsert rather than update: the row comes from an auth trigger, and a missing
 * row should not make a photo impossible to set. RLS checks `id = auth.uid()`
 * on both halves, so `userId` is not trusted, only convenient.
 */
export async function setAvatarPath(userId: string, avatarPath: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: userId, avatar_path: avatarPath });
  if (error) throw error;
}
