import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/ErrorState';
import { oldestFirst } from '@/domain/notes';
import { noteFormSchema } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { NoteLimitError, useAddNote } from '@/queries/use-note-mutations';
import { useNotes } from '@/queries/use-notes';
import { NoteItem } from './NoteItem';
import { SECTION_HEADING } from './panel';

const LIMIT_REACHED = 'This application already has 200 notes, which is the most it can hold.';

/**
 * The notes on an application (SPEC §4.4, §9.3), in creation order, with the
 * field that adds one.
 *
 * A new note appears at once, muted, while it saves; if the save fails the
 * muted note goes, the text comes back to the field, and the failure offers
 * Retry (§8.2, §8.3).
 */
export function NotesSection({ applicationId }: { applicationId: string }) {
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const notes = useNotes(applicationId);
  const add = useAddNote(applicationId);
  // Creation order, whatever order the rows reach this component in (§2).
  const ordered = useMemo(() => [...(notes.data ?? [])].sort(oldestFirst), [notes.data]);

  const save = (body: string) => {
    setDraft('');
    add.mutate(body, { onError: () => setDraft(body) });
  };

  const submit = () => {
    const parsed = noteFormSchema.safeParse({ body: draft });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? null);
      return;
    }
    setInvalid(null);
    save(parsed.data.body);
  };

  const failure = add.error ? (add.error instanceof NoteLimitError ? LIMIT_REACHED : "Couldn't save note.") : null;
  const retryable = failure !== null && !(add.error instanceof NoteLimitError) && add.variables !== undefined;

  return (
    <div className="flex flex-col gap-2">
      <h2 id={`${fieldId}-heading`} className={SECTION_HEADING}>
        Notes
      </h2>

      {notes.isPending ? (
        <div aria-hidden="true" className="flex flex-col gap-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : notes.isError ? (
        <ErrorState title="Couldn't load the notes." reference={errorReference(notes.error)}>
          <Button className="h-9 max-[760px]:h-11" onClick={() => void notes.refetch()}>
            Retry
          </Button>
        </ErrorState>
      ) : notes.data.length === 0 && !add.isPending ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul aria-labelledby={`${fieldId}-heading`} className="flex flex-col divide-y rounded-lg border">
          {ordered.map((note) => (
            <NoteItem key={note.id} note={note} applicationId={applicationId} />
          ))}
          {add.isPending && add.variables !== undefined ? (
            <li className="p-3 text-sm break-words whitespace-pre-wrap text-muted-foreground opacity-70">
              {add.variables}
              <span className="sr-only"> (saving)</span>
            </li>
          ) : null}
        </ul>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field data-invalid={!!invalid || !!failure}>
          <FieldLabel htmlFor={fieldId}>Add a note</FieldLabel>
          <Textarea
            id={fieldId}
            rows={2}
            value={draft}
            aria-invalid={invalid || failure ? true : undefined}
            aria-describedby={invalid || failure ? `${fieldId}-error` : `${fieldId}-help`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <FieldDescription id={`${fieldId}-help`}>Enter to add, Shift + Enter for a new line.</FieldDescription>
          <FieldError id={`${fieldId}-error`}>
            {invalid ?? (
              failure ? (
                <span className="flex flex-wrap items-center gap-2">
                  {failure}
                  {errorReference(add.error) ? (
                    <span className="text-muted-foreground">
                      Error reference <span className="font-mono">{errorReference(add.error)}</span>
                    </span>
                  ) : null}
                  {retryable ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-link max-[760px]:min-h-11"
                      onClick={() => save(add.variables!)}
                    >
                      Retry
                    </Button>
                  ) : null}
                </span>
              ) : null
            )}
          </FieldError>
        </Field>
        <Button type="submit" variant="outline" className="h-9 w-fit max-[760px]:h-11" disabled={add.isPending}>
          Add note
        </Button>
      </form>
    </div>
  );
}
