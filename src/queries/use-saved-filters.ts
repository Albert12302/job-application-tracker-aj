import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSavedFilter, deleteSavedFilter, listSavedFilters } from '@/data/saved-filters';
import { savedFilterInput } from '@/domain/filters';
import type { SavedFilter, SavedFilterFormValues } from '@/domain/schemas';
import { failureMessage, isRateLimited, reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

/** The user's saved filters, in tab order (§2, §4.2). */
export function useSavedFilters() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: keys.savedFilters(user.id),
    queryFn: () => reporting('load_saved_filters', () => listSavedFilters(user.id)),
    enabled: useIsSignedIn(),
    // Only this user changes them, and every change here updates the cache itself.
    staleTime: 60_000,
  });
}

/**
 * Save a filter from the builder (§4.2). A blank name becomes the next
 * "Custom N" among the filters already loaded; the new row goes on the end of
 * the tabs, as the database orders them.
 */
export function useCreateSavedFilter() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const key = keys.savedFilters(user.id);
  return useMutation({
    mutationFn: (values: SavedFilterFormValues) => {
      const names = (queryClient.getQueryData<SavedFilter[]>(key) ?? []).map((filter) => filter.name);
      return reporting('create_saved_filter', () => createSavedFilter(savedFilterInput(values, names)), isRateLimited);
    },
    // The saved row goes on the end of the tabs, where the database orders it;
    // no refetch, because this is the database's own answer.
    onSuccess: (filter) => {
      queryClient.setQueryData<SavedFilter[]>(key, (filters) => [...(filters ?? []), filter]);
    },
  });
}

/**
 * Delete a saved filter (§9.5): immediate, no confirmation — it destroys no
 * application data. The tab goes at once and comes back with a toast if the
 * delete fails.
 */
export function useDeleteSavedFilter() {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const key = keys.savedFilters(user.id);
  return useMutation({
    mutationFn: (filter: SavedFilter) =>
      reporting('delete_saved_filter', () => deleteSavedFilter(filter.id), isRateLimited),
    onMutate: async (filter) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<SavedFilter[]>(key);
      queryClient.setQueryData<SavedFilter[]>(key, (filters) => filters?.filter((candidate) => candidate.id !== filter.id));
      return { previous };
    },
    onError: (error, _filter, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error(failureMessage("Couldn't delete the filter.", error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
