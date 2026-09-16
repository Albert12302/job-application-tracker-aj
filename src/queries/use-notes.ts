import { useQuery } from '@tanstack/react-query';
import { countNotes, listNotes } from '@/data/notes';
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

/**
 * How many notes a set of applications holds, read while a bulk delete's
 * confirmation is open (§9.2). Always fresh: a stale count would misstate what
 * the delete takes.
 */
export function useNoteCount(applicationIds: readonly string[], enabled: boolean) {
  const user = useSignedInUser();
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: keys.noteCount(user.id, applicationIds),
    queryFn: () => reporting('load_note_count', () => countNotes(applicationIds)),
    enabled: signedIn && enabled && applicationIds.length > 0,
    staleTime: 0,
  });
}
