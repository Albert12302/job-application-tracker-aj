import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApplicationNotFoundError, createApplication, setStarred, WriteRateLimitedError } from '@/data/applications';
import type { ApplicationInput } from '@/domain/application-input';
import { newestFirst } from '@/domain/order';
import type { Application } from '@/domain/schemas';
import type { Status } from '@/domain/status';
import { changeStatus } from '@/services/change-status';
import { deleteApplication } from '@/services/delete-application';
import { updateApplication } from '@/services/update-application';
import { isRateLimited, reporting } from './errors';
import { keys } from './keys';
import { useSignedInUser } from './use-session';

export { ApplicationNotFoundError, WriteRateLimitedError };

/** Gone or not this user's: expected (another tab deleted it), shown, and not reported. */
const isNotFound = (error: unknown) => error instanceof ApplicationNotFoundError;

/**
 * Apply `patch` to application `id` wherever it is cached, at once (§8.3), and
 * return the function that puts both caches back if the write fails.
 */
async function patchCached(
  queryClient: QueryClient,
  userId: string,
  id: string,
  patch: Partial<Pick<Application, 'status' | 'starred'>>,
) {
  const listKey = keys.applicationList(userId);
  const detailKey = keys.application(userId, id);
  // A refetch landing mid-mutation would overwrite the optimistic value with the old one.
  await Promise.all([queryClient.cancelQueries({ queryKey: listKey }), queryClient.cancelQueries({ queryKey: detailKey })]);

  const list = queryClient.getQueryData<Application[]>(listKey);
  const detail = queryClient.getQueryData<Application | null>(detailKey);
  queryClient.setQueryData<Application[]>(listKey, (rows) => rows?.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  queryClient.setQueryData<Application | null>(detailKey, (row) => (row ? { ...row, ...patch } : row));

  return () => {
    queryClient.setQueryData(listKey, list);
    queryClient.setQueryData(detailKey, detail);
  };
}

/** Put a saved row into the caches — the database's answer, so no refetch is needed to show it. */
export function storeSaved(queryClient: QueryClient, userId: string, row: Application) {
  queryClient.setQueryData(keys.application(userId, row.id), row);
  queryClient.setQueryData<Application[]>(keys.applicationList(userId), (rows) =>
    rows ? [...rows.filter((existing) => existing.id !== row.id), row].sort(newestFirst) : rows,
  );
}

function refreshOne(queryClient: QueryClient, userId: string, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.applicationList(userId) }),
    queryClient.invalidateQueries({ queryKey: keys.application(userId, id) }),
  ]);
}

/** Delete one application; already gone counts as done (§9.2). */
const deleteIfPresent = (id: string) =>
  deleteApplication(id).catch((error: unknown) => {
    if (!isNotFound(error)) throw error;
  });

/**
 * Take deleted rows out of the list at once, and refresh what counted them.
 *
 * The list itself is not invalidated: the rows are gone from its cache, and
 * reloading every application to learn what this call already knows is the
 * refetch the delete does not need. The count and stats are derived elsewhere,
 * so they are asked again.
 */
function dropDeleted(queryClient: QueryClient, userId: string, ids: readonly string[]) {
  const gone = new Set(ids);
  queryClient.setQueryData<Application[]>(keys.applicationList(userId), (rows) => rows?.filter((row) => !gone.has(row.id)));
  void queryClient.invalidateQueries({ queryKey: keys.applicationCount(userId) });
  void queryClient.invalidateQueries({ queryKey: keys.stats(userId) });
}

function forget(queryClient: QueryClient, userId: string, id: string) {
  queryClient.removeQueries({ queryKey: keys.application(userId, id) });
  queryClient.removeQueries({ queryKey: keys.notes(userId, id) });
}

/**
 * Add (§4.3). The new row goes straight into the list cache, in order, so the
 * list it returns to already shows it; the whole applications prefix is then
 * refreshed, which brings the profile's count along.
 */
export function useCreateApplication() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, firstNote }: { input: ApplicationInput; firstNote: string | null }) =>
      reporting('create_application', () => createApplication(input, firstNote)),
    onSuccess: (row) => {
      storeSaved(queryClient, user.id, row);
      void queryClient.invalidateQueries({ queryKey: keys.applications(user.id) });
    },
  });
}

/** Edit (§9.1). Not optimistic — §8.3 names status, star, and note add only. */
export function useUpdateApplication(id: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationInput) => reporting('update_application', () => updateApplication(id, input), isNotFound),
    onSuccess: (row) => {
      storeSaved(queryClient, user.id, row);
      void queryClient.invalidateQueries({ queryKey: keys.applicationList(user.id) });
      // The form can change the status (§9.1).
      void queryClient.invalidateQueries({ queryKey: keys.stats(user.id) });
    },
  });
}

/** The detail-screen selector (§4.4): optimistic, rolled back with a toast on failure (§8.3). */
export function useChangeStatus(id: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: Status) => reporting('change_status', () => changeStatus(id, status), isNotFound),
    onMutate: async (status) => ({ rollback: await patchCached(queryClient, user.id, id, { status }) }),
    onError: (_error, _status, context) => {
      context?.rollback();
      toast.error("Couldn't change the status.");
    },
    onSuccess: (row) => storeSaved(queryClient, user.id, row),
    // Stats follow the history row this wrote (§4.4: "recalculates … the stats screen live").
    onSettled: () =>
      Promise.all([refreshOne(queryClient, user.id, id), queryClient.invalidateQueries({ queryKey: keys.stats(user.id) })]),
  });
}

/** The star, in the list and on the detail screen (§4.2): optimistic, rolled back on failure (§8.3). */
export function useToggleStar() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean; company: string }) =>
      reporting('star_application', () => setStarred(id, starred), isNotFound),
    onMutate: async ({ id, starred }) => ({ rollback: await patchCached(queryClient, user.id, id, { starred }) }),
    // Only a failure asks the database again: a star writes one column, and the
    // optimistic patch already holds what a success would return (§8.3).
    onError: (_error, { id, starred, company }, context) => {
      context?.rollback();
      toast.error(`Couldn't ${starred ? 'star' : 'unstar'} ${company}.`);
      void refreshOne(queryClient, user.id, id);
    },
  });
}

/**
 * Delete (§9.2). Already gone counts as done. The row leaves the list cache at
 * once; the detail cache is dropped by useForgetApplication once the screen
 * showing it has gone, so it never flashes "not found" on its way out.
 */
export function useDeleteApplication(id: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reporting('delete_application', () => deleteIfPresent(id)),
    onSuccess: () => dropDeleted(queryClient, user.id, [id]),
  });
}

/** Where a bulk delete stopped, if it did: the application it could not delete, and why. */
export type BulkDeleteResult = { deleted: string[]; failed: { id: string; error: unknown } | null };

/**
 * Delete several applications from the list (§9.2), each through the same
 * services/delete-application.ts as the detail screen, one at a time.
 *
 * It stops at the first failure rather than trying the rest: most failures —
 * the write limit above all — would refuse the rest too. What was deleted
 * leaves every cache; the result says where it stopped, so the screen can keep
 * the rest selected and a second confirm carries on.
 */
export function useDeleteApplications() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]): Promise<BulkDeleteResult> => {
      const deleted: string[] = [];
      for (const id of ids) {
        try {
          await reporting('delete_application', () => deleteIfPresent(id), isRateLimited);
          deleted.push(id);
        } catch (error) {
          return { deleted, failed: { id, error } };
        }
      }
      return { deleted, failed: null };
    },
    onSuccess: ({ deleted }) => {
      if (deleted.length === 0) return;
      for (const id of deleted) forget(queryClient, user.id, id);
      dropDeleted(queryClient, user.id, deleted);
    },
  });
}

export function useForgetApplication() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  return (id: string) => forget(queryClient, user.id, id);
}
