import { useMutation, useMutationState, useQuery, useQueryClient, type MutationState } from '@tanstack/react-query';
import { coverLetterPreviewUrl, coverLetterSize, downloadCoverLetter } from '@/data/storage';
import type { Application } from '@/domain/schemas';
import { attachCoverLetter, coverLetterFileProblem, CoverLetterRejectedError } from '@/services/attach-cover-letter';
import { removeCoverLetter } from '@/services/remove-cover-letter';
import { isRateLimited, reporting } from './errors';
import { keys } from './keys';
import { storeSaved } from './use-application-mutations';
import { useIsSignedIn, useSignedInUser } from './use-session';

export { coverLetterFileProblem, CoverLetterRejectedError };

/**
 * Cover letters (SPEC §4.3, §4.4, §9.4). None of these is optimistic — §8.3
 * names status, star, and note add only — and each puts the row the database
 * returned into the caches, so the list's paperclip and the detail screen
 * agree without a refetch.
 */

export type AttachVariables = { applicationId: string; file: File; currentPath: string | null };

const isRejected = (error: unknown) => error instanceof CoverLetterRejectedError;

/**
 * Pointing the row at a file — or at none — is a write like any other, so the
 * §7.1 limit can refuse it. The user's to wait out, shown, and not reported.
 */
const isExpected = (error: unknown) => isRejected(error) || isRateLimited(error);

/** The stored file's size in bytes. An object at a path never changes, so it never goes stale. */
export function useCoverLetterSize(path: string | null) {
  const user = useSignedInUser();
  const signedIn = useIsSignedIn();
  return useQuery({
    queryKey: keys.coverLetterSize(user.id, path ?? ''),
    queryFn: () => reporting('load_cover_letter_size', () => coverLetterSize(path ?? '')),
    enabled: signedIn && path !== null,
    staleTime: Infinity,
  });
}

/**
 * Attach or replace (services/attach-cover-letter.ts). Keyed, so the upload is
 * visible to whichever screen is showing that application — the add form
 * starts one and may hand over to the detail screen before it fails (§8.2).
 *
 * On failure the detail is refreshed: if another tab changed the file first,
 * a retry then starts from what the row holds now.
 */
export function useAttachCoverLetter() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: keys.coverLetterUpload(user.id),
    mutationFn: ({ applicationId, file, currentPath }: AttachVariables) =>
      reporting('attach_cover_letter', () => attachCoverLetter(applicationId, file, currentPath), isExpected),
    onSuccess: (row, { file }) => {
      storeSaved(queryClient, user.id, row);
      // The browser already knows the size of the file it just sent.
      if (row.cover_letter_path) queryClient.setQueryData(keys.coverLetterSize(user.id, row.cover_letter_path), file.size);
    },
    onError: (error, { applicationId }) => {
      if (isRejected(error)) return;
      void queryClient.invalidateQueries({ queryKey: keys.application(user.id, applicationId) });
    },
  });
}

/** The latest attach or replace for one application, from whichever screen started it; undefined if none. */
export function useLatestCoverLetterUpload(applicationId: string) {
  const user = useSignedInUser();
  const uploads = useMutationState<MutationState<Application, Error, AttachVariables>>({
    filters: {
      mutationKey: keys.coverLetterUpload(user.id),
      predicate: (mutation) => (mutation.state.variables as AttachVariables | undefined)?.applicationId === applicationId,
    },
    select: (mutation) => mutation.state as MutationState<Application, Error, AttachVariables>,
  });
  return uploads.at(-1);
}

/** Remove, after the user has confirmed (services/remove-cover-letter.ts). */
export function useRemoveCoverLetter(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => reporting('remove_cover_letter', () => removeCoverLetter(applicationId, path), isRateLimited),
    onSuccess: (row) => storeSaved(queryClient, user.id, row),
    onError: () => queryClient.invalidateQueries({ queryKey: keys.application(user.id, applicationId) }),
  });
}

/**
 * The file, through a signed URL made on click (§7.3). The caller saves it and
 * resets the mutation, so the bytes are not held after. A file another tab
 * removed first is a failure like any other, and the refreshed detail shows
 * what the row holds now.
 */
export function useDownloadCoverLetter(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => reporting('download_cover_letter', () => downloadCoverLetter(path)),
    onError: () => queryClient.invalidateQueries({ queryKey: keys.application(user.id, applicationId) }),
  });
}

/**
 * A signed URL for opening a PDF in its own tab (§4.4), made on click. The
 * caller hands it to the tab and resets the mutation, so the URL is not held
 * after. Fails the same way a download does.
 */
export function usePreviewCoverLetter(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => reporting('preview_cover_letter', () => coverLetterPreviewUrl(path)),
    onError: () => queryClient.invalidateQueries({ queryKey: keys.application(user.id, applicationId) }),
  });
}
