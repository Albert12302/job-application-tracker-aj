import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signIn, SignInError } from '@/data/auth';
import { setName } from '@/data/profile';
import type { SignInValues } from '@/domain/schemas';
import { removeAvatar } from '@/services/remove-avatar';
import { AvatarRejectedError, setAvatar } from '@/services/set-avatar';
import { signOut } from '@/services/sign-out';
import { isRateLimited, reporting } from './errors';
import { keys } from './keys';
import { useSignedInUser } from './use-session';

export { AvatarRejectedError, SignInError };
export type { SignInFailure } from '@/data/auth';

/**
 * No invalidation: the session change re-runs the router guards, which move
 * the user off /sign-in (main.tsx).
 */
export function useSignIn() {
  return useMutation({
    mutationFn: ({ email, password }: SignInValues) =>
      reporting(
        'sign_in',
        () => signIn(email, password),
        (error) => error instanceof SignInError && error.reason !== 'unavailable',
      ),
  });
}

/** Cache clearing happens on any sign-out, deliberate or expired (main.tsx), not only here. */
export function useSignOut() {
  return useMutation({ mutationFn: () => reporting('sign_out', signOut) });
}

/**
 * The display name (§4.6). Not optimistic — §8.3 names status, star and note
 * only, and this is one small write with a control of its own to show it
 * running.
 *
 * One invalidation is enough for both places the name appears: the profile card
 * and the header both read it from `useProfile()` (ProfileScreen, AppShell), so
 * neither can be left showing the old one. Nothing else derives from it, so
 * nothing else is invalidated.
 *
 * `isRateLimited` because `profiles` is counted by §7.1's write limit
 * (migration 20260921234631) — a refused name change is the user's to wait out,
 * not a bug to report. The name itself never reaches `reportError`, which takes
 * the action alone (§7.7).
 */
export function useSetName() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string | null) => reporting('update_name', () => setName(user.id, name), isRateLimited),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profile(user.id) }),
  });
}

/**
 * Not optimistic — §8.3 names status, star and note only. Invalidates the
 * profile, which carries the new path; the image query for that path is new
 * and fetches itself.
 *
 * On failure the profile is refreshed too: if another tab changed the photo
 * first, a retry then starts from what the profile holds now.
 */
export function useSetAvatar() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, previousPath }: { file: File; previousPath: string | null }) =>
      reporting(
        'upload_avatar',
        () => setAvatar(user.id, file, previousPath),
        (error) => error instanceof AvatarRejectedError,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profile(user.id) }),
    onError: (error) => {
      if (error instanceof AvatarRejectedError) return;
      void queryClient.invalidateQueries({ queryKey: keys.profile(user.id) });
    },
  });
}

export function useRemoveAvatar() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => reporting('remove_avatar', () => removeAvatar(user.id, path)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.profile(user.id) }),
  });
}
