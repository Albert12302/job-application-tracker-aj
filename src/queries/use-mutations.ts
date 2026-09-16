import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signIn, SignInError } from '@/data/auth';
import type { SignInValues } from '@/domain/schemas';
import { removeAvatar } from '@/services/remove-avatar';
import { AvatarRejectedError, setAvatar } from '@/services/set-avatar';
import { signOut } from '@/services/sign-out';
import { reporting } from './errors';
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
 * Not optimistic — §8.3 names status, star and note only. Invalidates the
 * profile, which carries the new path; the image query for that path is new
 * and fetches itself.
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
  });
}

export function useRemoveAvatar() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => reporting('remove_avatar', () => removeAvatar(user.id, path)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profile(user.id) }),
  });
}
