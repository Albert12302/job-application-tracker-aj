import { useQuery } from '@tanstack/react-query';
import { listNotes } from '@/data/notes';
import { reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

/** An application's notes, in creation order (SPEC §2). */
export function useNotes(applicationId: string | null) {
  const user = useSignedInUser();
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: keys.notes(user.id, applicationId ?? ''),
    queryFn: () => reporting('load_notes', () => listNotes(applicationId ?? '')),
    enabled: signedIn && applicationId !== null,
    staleTime: 0,
  });
}
