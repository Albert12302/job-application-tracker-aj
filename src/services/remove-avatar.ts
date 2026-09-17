import { setAvatarPath } from '@/data/profile';
import { discardObject } from './discard-object';

/**
 * "Remove photo" (SPEC §4.6). The profile lets go of the path first, so the
 * photo is gone from the user's point of view the moment this resolves. If the
 * Storage delete then fails, the object is an orphan: reported for cleanup
 * rather than failing the whole removal (§9.2). The profile lets go only if it
 * still holds `path`; if another tab changed the photo first, nothing is deleted.
 */
export async function removeAvatar(userId: string, path: string): Promise<void> {
  await setAvatarPath(userId, null, path);

  await discardObject('avatar', path);
}
