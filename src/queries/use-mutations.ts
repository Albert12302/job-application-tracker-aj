import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PasswordResetError, recoveryLink, requestPasswordReset, setPasswordWithRecovery, signIn, SignInError } from '@/data/auth';
import { setName } from '@/data/profile';
import type { ForgotPasswordValues, ResetPasswordValues, SignInValues } from '@/domain/schemas';
import { removeAvatar } from '@/services/remove-avatar';
import { AvatarRejectedError, setAvatar } from '@/services/set-avatar';
import { signOut } from '@/services/sign-out';
import { isRateLimited, reporting } from './errors';
import { keys } from './keys';
import { useSignedInUser } from './use-session';

export { AvatarRejectedError, PasswordResetError, SignInError };
export type { PasswordResetFailure, SignInFailure } from '@/data/auth';

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

/**
 * The reset request (§4.1c). No invalidation and nothing to put in a cache:
 * the answer is the same sentence whatever Auth did, and the screen that shows
 * it needs only to know the request was made.
 */
export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: ({ email }: ForgotPasswordValues) =>
      reporting('request_password_reset', () => requestPasswordReset(email)),
  });
}

/**
 * The new password (§4.1d). The link is read once, at module load, so the
 * mutation takes only what the user typed.
 *
 * Nothing is invalidated and no cache is cleared: this runs with the app signed
 * out, so there is nothing cached to be wrong. Every outcome but `unavailable`
 * is the user's to act on — a spent link, a password Auth would not take — so
 * only the last is reported.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: ({ password }: ResetPasswordValues) =>
      reporting(
        'reset_password',
        () => {
          if (recoveryLink.status !== 'ready') throw new PasswordResetError('invalid-link');
          return setPasswordWithRecovery(recoveryLink, password);
        },
        (error) => error instanceof PasswordResetError && error.reason !== 'unavailable',
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
