import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { countApplications, countCoverLetters } from '@/data/applications';
import { countAllNotes } from '@/data/notes';
import { getProfile } from '@/data/profile';
import { deleteAccount, type DeletionStage } from '@/services/delete-account';
import { reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

/** What the dialog says goes: "Deletes N applications, N notes, N files…" (§9.7). */
export type DeletionSummary = { applications: number; notes: number; files: number };

/**
 * The counts behind the deletion dialog's sentence (SPEC §9.7).
 *
 * Three head counts, read when the dialog opens — never cached across it, so
 * the number a user is shown before an irreversible act is the number that is
 * true now. §9.7 does not say where they come from; they are counted rather
 * than taken from an export the user may not have run.
 *
 * Files are the cover letters plus the avatar, which is what the export puts in
 * `files/` (§9.8), so the two agree.
 */
export function useDeletionSummary(enabled: boolean) {
  const user = useSignedInUser();
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: keys.deletionSummary(user.id),
    queryFn: () =>
      reporting('load_deletion_summary', async (): Promise<DeletionSummary> => {
        const [applications, notes, coverLetters, profile] = await Promise.all([
          countApplications(user.id),
          countAllNotes(),
          countCoverLetters(user.id),
          getProfile(user.id),
        ]);
        return { applications, notes, files: coverLetters + (profile?.avatar_path ? 1 : 0) };
      }),
    enabled: enabled && signedIn,
    gcTime: 0,
    staleTime: 0,
  });
}

/**
 * Delete this account (§9.7). No invalidation and no cache work: the session
 * ends with it, and main.tsx clears the whole cache on that change.
 */
export function useDeleteAccount() {
  const user = useSignedInUser();
  const [stage, setStage] = useState<DeletionStage | null>(null);

  const mutation = useMutation({
    mutationFn: () => reporting('delete_account', () => deleteAccount(user.id, setStage)),
  });

  return { ...mutation, stage };
}
