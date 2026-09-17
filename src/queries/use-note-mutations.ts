import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addNote, deleteNote, NoteLimitError, NoteNotFoundError, restoreNote, updateNote } from '@/data/notes';
import type { Note } from '@/domain/schemas';
import { failureMessage, isRateLimited, reporting } from './errors';
import { keys } from './keys';
import { useSignedInUser } from './use-session';

export { NoteLimitError };

/**
 * The cap, a note already gone, and the write limit are all the user's world,
 * not bugs: shown, never reported (§7.1, §9.3).
 */
const isExpected = (error: unknown) =>
  error instanceof NoteLimitError || error instanceof NoteNotFoundError || isRateLimited(error);

function put(queryClient: QueryClient, key: readonly unknown[], notes: (current: Note[]) => Note[]) {
  queryClient.setQueryData<Note[]>(key, (current) => (current ? notes(current) : current));
}

/**
 * Order is imposed where notes render (NotesSection), so a saved note just
 * joins the cache — and the cache now holds the row the database returned, so
 * nothing is invalidated: the open screen would refetch every note to be told
 * what it was just told.
 */
function append(queryClient: QueryClient, key: readonly unknown[], note: Note) {
  put(queryClient, key, (notes) => [...notes, note]);
}

/**
 * Add a note (SPEC §4.4). Not optimistic in the cache: the screen shows the
 * text it just submitted as a muted item while this runs (§8.2), which keeps
 * a half-saved note out of the list everything else reads.
 */
export function useAddNote(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const key = keys.notes(user.id, applicationId);
  return useMutation({
    mutationFn: (body: string) => reporting('add_note', () => addNote(applicationId, body), isExpected),
    onSuccess: (note) => append(queryClient, key, note),
  });
}

/** Edit in place (§9.3). Order stays by created_at; only updated_at moves. */
export function useUpdateNote(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const key = keys.notes(user.id, applicationId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      reporting('update_note', () => updateNote(id, body), isExpected),
    onSuccess: (saved) => put(queryClient, key, (notes) => notes.map((note) => (note.id === saved.id ? saved : note))),
  });
}

/**
 * Delete (§9.3): the note goes at once, and Undo puts it back where it was.
 *
 * The toast belongs to this hook rather than the caller, because the note
 * removes itself from the list the moment this starts — so the component that
 * asked for the delete has unmounted by the time it finishes, and callbacks
 * passed to mutate() would never run.
 */
export function useDeleteNote(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const restore = useRestoreNote(applicationId);
  const key = keys.notes(user.id, applicationId);
  return useMutation({
    mutationFn: (note: Note) => reporting('delete_note', () => deleteNote(note.id), isExpected),
    onSuccess: (_result, note) =>
      toast('Note deleted.', { action: { label: 'Undo', onClick: () => restore.mutate(note) } }),
    onMutate: async (note) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Note[]>(key);
      put(queryClient, key, (notes) => notes.filter((existing) => existing.id !== note.id));
      return { previous };
    },
    onError: (error, _note, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error(failureMessage("Couldn't delete the note.", error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Undo a delete (§9.3). The note comes back with its original text and
 * created_at, so it returns to its own place in the list rather than the end.
 */
export function useRestoreNote(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const key = keys.notes(user.id, applicationId);
  return useMutation({
    mutationFn: (note: Note) => reporting('restore_note', () => restoreNote(note), isExpected),
    onSuccess: (note) => append(queryClient, key, note),
    onError: (error) => toast.error(failureMessage("Couldn't bring the note back.", error)),
  });
}
