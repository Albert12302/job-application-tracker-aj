import { useQuery } from '@tanstack/react-query';
import { listApplications } from '@/data/applications';
import { reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

/** The user's applications, newest first (§4.2, §5.3). */
export function useApplications() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: keys.applicationList(user.id),
    queryFn: () => reporting('load_applications', () => listApplications(user.id)),
    enabled: useIsSignedIn(),
    // A list can be seconds old; every mutation that changes it invalidates it.
    staleTime: 30_000,
  });
}
