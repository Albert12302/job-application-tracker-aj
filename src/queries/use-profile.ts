import { useQuery } from '@tanstack/react-query';
import { countApplications } from '@/data/applications';
import { getProfile } from '@/data/profile';
import { downloadAvatarDataUrl } from '@/data/storage';
import { reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

export function useProfile() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: keys.profile(user.id),
    queryFn: () => reporting('load_profile', () => getProfile(user.id)),
    enabled: useIsSignedIn(),
    // Only this user edits it, and every edit invalidates it.
    staleTime: 5 * 60_000,
  });
}

/**
 * The photo at `path`, as a data: URL. A path is never reused — each upload
 * gets a fresh uuid — so a cached image can never be stale.
 */
export function useAvatarImage(path: string | null | undefined) {
  return useQuery({
    queryKey: keys.avatar(path ?? ''),
    queryFn: () => reporting('load_avatar', () => (path ? downloadAvatarDataUrl(path) : Promise.resolve(null))),
    enabled: useIsSignedIn() && !!path,
    staleTime: Infinity,
  });
}

export function useApplicationCount() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: keys.applicationCount(user.id),
    queryFn: () => reporting('load_application_count', () => countApplications(user.id)),
    enabled: useIsSignedIn(),
    staleTime: 30_000,
  });
}
