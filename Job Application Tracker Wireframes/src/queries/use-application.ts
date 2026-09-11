import { useQuery } from '@tanstack/react-query';
import { getApplication } from '@/data/applications';
import { reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

/**
 * One application, or null when it is missing or not this user's (§8.2).
 * `id` null means the URL held no valid id: nothing is fetched.
 */
export function useApplication(id: string | null) {
  const user = useSignedInUser();
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: keys.application(user.id, id ?? ''),
    queryFn: () => reporting('load_application', () => getApplication(id ?? '')),
    enabled: signedIn && id !== null,
    // An open detail screen shows what the database holds now (CLAUDE.md).
    staleTime: 0,
  });
}
