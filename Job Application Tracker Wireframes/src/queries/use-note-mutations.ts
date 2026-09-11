import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addNote, deleteNote, NoteLimitError, NoteNotFoundError, restoreNote, updateNote } from '@/data/notes';
import type { Note } from '@/domain/schemas';
import { reporting } from './errors';
import { keys } from './keys';
import { useSignedInUser } from './use-session';

export { NoteLimitError };

/** The cap and a note already gone are both the user's world, not bugs: shown, never reported. */
const isExpected = (error: unknown) => error instanceof NoteLimitError || error instanceof NoteNotFoundError;

const byCreation = (a: Note, b: Note) => Date.parse(a.created_at) - Date.parse(b.created_at);

function put(queryClient: QueryClient, key: readonly unknown[], notes: (current: Note[]) => Note[]) {
  queryClient.setQueryData<Note[]>(key, (current) => (current ? notes(current) : current));
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
    onSuccess: (note) => {
      put(queryClient, key, (notes) => [...notes, note].sort(byCreation));
      void queryClient.invalidateQueries({ queryKey: key });
    },
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

/** Delete (§9.3): the note goes at once, and Undo puts it back where it was. */
export function useDeleteNote(applicationId: string) {
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const key = keys.notes(user.id, applicationId);
  return useMutation({
    mutationFn: (note: Note) => reporting('delete_note', () => deleteNote(note.id), isExpected),
    onMutate: async (note) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Note[]>(key);
      put(queryClient, key, (notes) => notes.filter((existing) => existing.id !== note.id));
      return { previous };
    },
    onError: (_error, _note, context) => {
      queryClient.setQueryData(key, context?.previous);
      toast.error("Couldn't delete the note.");
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
    onSuccess: (note) => {
      put(queryClient, key, (notes) => [...notes, note].sort(byCreation));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error("Couldn't bring the note back."),
  });
}
