import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatMoment } from '@/domain/date';
import { noteDeleteNeedsConfirmation } from '@/domain/notes';
import type { Note } from '@/domain/schemas';
import { failureMessage } from '@/queries/errors';
import { useDeleteNote, useUpdateNote } from '@/queries/use-note-mutations';

const ICON_BUTTON = 'text-muted-foreground max-[760px]:size-11';

/**
 * One note (SPEC §9.3): edited in place, saved on blur or with Save, cancelled
 * with Escape. A note longer than a line is confirmed before it goes; a
 * shorter one goes at once and can be brought back from the toast.
 */
export function NoteItem({ note, applicationId }: { note: Note; applicationId: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [confirming, setConfirming] = useState(false);
  const update = useUpdateNote(applicationId);
  const remove = useDeleteNote(applicationId);

  const when = formatMoment(note.created_at);
  const edited = note.updated_at !== note.created_at;

  const stopEditing = () => {
    setEditing(false);
    setDraft(note.body);
    update.reset();
  };

  const save = () => {
    const body = draft.trim();
    if (!body || body === note.body) {
      stopEditing();
      return;
    }
    update.mutate({ id: note.id, body }, { onSuccess: () => setEditing(false) });
  };

  // The undo toast lives in the mutation: this note unmounts as soon as it goes.
  const deleteNote = () => {
    setConfirming(false);
    remove.mutate(note);
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-2 p-3">
        <Textarea
          autoFocus
          rows={3}
          aria-label={`Edit note from ${when}`}
          value={draft}
          disabled={update.isPending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') stopEditing();
          }}
          onBlur={(event) => {
            // Save on blur, unless the focus went to this note's own buttons,
            // which say what to do themselves (§9.3).
            if (!(event.relatedTarget instanceof Element) || !event.relatedTarget.closest('[data-note-action]')) save();
          }}
        />
        {update.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {failureMessage("Couldn't save the note.", update.error)}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            data-note-action
            size="sm"
            className="max-[760px]:h-11"
            disabled={update.isPending}
            onClick={save}
          >
            Save
          </Button>
          <Button data-note-action size="sm" variant="ghost" className="max-[760px]:h-11" onClick={stopEditing}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 p-3">
      <div className="min-w-0">
        {/* Free text, rendered as text — never as HTML (§7.3). */}
        <p className="text-sm break-words whitespace-pre-wrap">{note.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          <time dateTime={note.created_at}>{when}</time>
          {edited ? ' · edited' : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className={ICON_BUTTON}
          aria-label={`Edit note from ${when}`}
          onClick={() => setEditing(true)}
        >
          <PencilIcon aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={ICON_BUTTON}
          aria-label={`Delete note from ${when}`}
          disabled={remove.isPending}
          onClick={() => (noteDeleteNeedsConfirmation(note.body) ? setConfirming(true) : deleteNote())}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>This one is longer than a line, so it cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep note</AlertDialogCancel>
            <AlertDialogAction onClick={deleteNote}>Delete note</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
