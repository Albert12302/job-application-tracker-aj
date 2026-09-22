import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, PencilIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { profileNameSchema, type ProfileNameValues } from '@/domain/schemas';
import { errorReference, failureMessage } from '@/queries/errors';
import { useSetName } from '@/queries/use-mutations';

/**
 * The name on the profile card, and the control that changes it (SPEC §4.6).
 *
 * The heading stays rendered in both states, rather than being swapped for the
 * input: it is the screen's `h1` and the id the profile section is labelled by
 * (ProfileScreen), so a version of this that replaced it left the screen with
 * no heading and the section pointing `aria-labelledby` at nothing. Editing
 * therefore reads as the name you have, with the name you are typing beneath it.
 *
 * `name` is what the app calls the user — the stored name or, with none, the one
 * derived from the email (domain/profile.ts). `stored` is what the column
 * actually holds, which is what the field edits: starting from the derived name
 * would silently adopt it as a chosen one the first time anything was saved.
 */
export function NameField({ name, stored }: { name: string; stored: string | null }) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement | null>(null);
  // Set only by Cancel and a successful Save, so closing returns focus to the
  // button that opened the field — while a first render does not steal it.
  const returnFocus = useRef(false);
  const setName = useSetName();
  const form = useForm<ProfileNameValues>({
    resolver: zodResolver(profileNameSchema),
    defaultValues: { name: stored ?? '' },
  });
  const { errors } = form.formState;
  const pending = setName.isPending;

  // The field is the point of opening, so focus goes to it rather than leaving
  // the user to find it. setFocus, not autoFocus: it also runs on a reopen.
  // Leaving, the button it came from is only mounted once `editing` is false,
  // which is why this waits for the render rather than focusing inside close().
  useEffect(() => {
    if (editing) {
      form.setFocus('name');
      return;
    }
    if (returnFocus.current) {
      returnFocus.current = false;
      editRef.current?.focus();
    }
  }, [editing, form]);

  function open() {
    form.reset({ name: stored ?? '' });
    setName.reset();
    setEditing(true);
  }

  /** Back to the heading, with focus where it started (§10.3). */
  function close() {
    returnFocus.current = true;
    setEditing(false);
    setName.reset();
  }

  // handleSubmit is called here rather than during render: the callback closes
  // over `returnFocus`, and building it in the render pass reads as a ref read
  // during render (react-hooks/refs).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(({ name: next }) => {
      // Already trimmed by the schema. Empty clears the name (§4.6), which the
      // column holds as null, not as ''.
      setName.mutate(next === '' ? null : next, {
        onSuccess: () => {
          toast.success(next === '' ? 'Name removed.' : 'Name updated.');
          close();
        },
      });
    })(event);
  }

  const validation = errors.name?.message;
  const message = validation ?? (setName.error ? failureMessage("Couldn't save your name.", setName.error) : null);
  // The limit's copy carries no reference, because nothing was reported (§8.1).
  const reference = validation ? null : errorReference(setName.error);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex items-center gap-1">
        <h1 id="profile-name" className="font-heading text-lg font-semibold">
          {name}
        </h1>
        {editing ? null : (
          <Button
            ref={editRef}
            variant="ghost"
            size="icon-lg"
            className="text-link"
            aria-label="Edit name"
            onClick={open}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={onSubmit} noValidate aria-busy={pending} className="flex w-full flex-col gap-2">
          <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor={inputId}>Your name</FieldLabel>
              <Input
                id={inputId}
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={message ? errorId : undefined}
                className="h-9 max-[760px]:h-11"
                {...form.register('name')}
              />
            </Field>

            {message ? (
              <div id={errorId} role="alert" className="text-sm text-destructive">
                <p>{message}</p>
                {reference ? (
                  <p className="text-muted-foreground">
                    Error reference <span className="font-mono">{reference}</span>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" size="lg" className="flex-1">
                {pending ? (
                  <>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              <Button type="button" variant="outline" size="lg" className="flex-1" onClick={close}>
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </div>
  );
}
