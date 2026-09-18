import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Controller, useForm, type FieldError as FieldErrorType } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { applicationFormSchema, type ApplicationFormValues } from '@/domain/schemas';
import { STATUSES, type Status } from '@/domain/status';
import { errorReference, failureMessage } from '@/queries/errors';
import { DiscardChangesDialog } from './DiscardChangesDialog';

const CONTROL = 'h-9 max-[760px]:h-11';

/**
 * Two columns on the wide card, one below 760px (§11). Short fields pair up, in reading
 * order so Tab moves left to right; long ones take the whole row with `WIDE`.
 */
const GRID = 'grid grid-cols-2 gap-x-6 gap-y-4 max-[760px]:grid-cols-1';
/** `col-span-full`, not `col-span-2`: in the one-column grid, a span of 2 would add a second column. */
const WIDE = 'col-span-full';

/** Natural width beside the fields, full-width halves on a phone (§11's 44px targets come from `size="lg"`). */
const ACTION = 'min-w-32 max-[760px]:flex-1';

/** Company and position share this one message (SPEC §4.3), so it is shown once. */
const REQUIRED = 'Company and position are required.';

/**
 * Add and Edit are the same form against the same schema (SPEC §4.3, §9.1) —
 * one set of fields, one set of messages, so the two screens cannot drift.
 *
 * A failed save keeps every value (§8.2): nothing is cleared or reset here,
 * and the screen above decides where a successful one goes. Leaving with
 * unsaved changes asks first (§9.1).
 */
export function ApplicationForm({
  defaultValues,
  locations,
  showFirstNote = false,
  coverLetter,
  coverLetterChosen = false,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  defaultValues: ApplicationFormValues;
  locations: readonly string[];
  showFirstNote?: boolean;
  /** The add form's cover letter field (§4.3). The file is not a form value: it is uploaded, not validated by the schema. */
  coverLetter?: ReactNode;
  /** A chosen file counts as a change worth confirming before Cancel discards it (§9.1). */
  coverLetterChosen?: boolean;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (values: ApplicationFormValues) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const field = (name: string) => `${formId}-${name}`;
  const summaryId = field('summary');
  const locationsId = field('locations');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const form = useForm<ApplicationFormValues>({ resolver: zodResolver(applicationFormSchema), defaultValues });
  const { errors, isDirty, submitCount } = form.formState;

  // The shared message goes above the form and each empty field points at it;
  // everything else is a field-level message under its own field (§8.2).
  const missingRequired = errors.company?.message === REQUIRED || errors.position?.message === REQUIRED;
  const summary = missingRequired ? REQUIRED : error ? failureMessage("Couldn't save this application.", error) : null;
  const reference = missingRequired ? null : errorReference(error);

  const describedBy = (fieldError: FieldErrorType | undefined, name: string) => {
    if (!fieldError) return undefined;
    return fieldError.message === REQUIRED ? summaryId : field(`${name}-error`);
  };
  const fieldMessage = (fieldError: FieldErrorType | undefined) =>
    fieldError?.message && fieldError.message !== REQUIRED ? fieldError.message : null;

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-busy={pending} className="flex flex-col gap-4">
        {summary ? (
          // Keyed per attempt, so a repeated message is announced again.
          <Alert key={`${submitCount}-${String(!!error)}`} id={summaryId} variant="destructive">
            <AlertDescription className="text-destructive">
              {summary}
              {reference ? (
                <>
                  {' '}
                  Error reference <span className="font-mono">{reference}</span>.
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <FieldGroup className={GRID}>
            <Field data-invalid={!!errors.company}>
              <FieldLabel htmlFor={field('company')}>Company</FieldLabel>
              <Input
                id={field('company')}
                className={CONTROL}
                autoComplete="organization"
                aria-invalid={errors.company ? true : undefined}
                aria-describedby={describedBy(errors.company, 'company')}
                {...form.register('company')}
              />
              <FieldError id={field('company-error')}>{fieldMessage(errors.company)}</FieldError>
            </Field>

            <Field data-invalid={!!errors.position}>
              <FieldLabel htmlFor={field('position')}>Position</FieldLabel>
              <Input
                id={field('position')}
                className={CONTROL}
                aria-invalid={errors.position ? true : undefined}
                aria-describedby={describedBy(errors.position, 'position')}
                {...form.register('position')}
              />
              <FieldError id={field('position-error')}>{fieldMessage(errors.position)}</FieldError>
            </Field>

            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor={field('date')}>Date applied</FieldLabel>
              <Input
                id={field('date')}
                type="date"
                className={CONTROL}
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={describedBy(errors.date, 'date')}
                {...form.register('date')}
              />
              <FieldError id={field('date-error')}>{fieldMessage(errors.date)}</FieldError>
            </Field>

            <Field data-invalid={!!errors.location}>
              <FieldLabel htmlFor={field('location')}>Location</FieldLabel>
              <Input
                id={field('location')}
                className={CONTROL}
                list={locationsId}
                autoComplete="off"
                aria-invalid={errors.location ? true : undefined}
                aria-describedby={errors.location ? field('location-error') : field('location-help')}
                {...form.register('location')}
              />
              {/* Suggestions, not a fixed list: a new place is typed straight in (§4.3). */}
              <datalist id={locationsId}>
                {locations.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
              <FieldDescription id={field('location-help')}>
                Pick one you have used before, or type a new one.
              </FieldDescription>
              <FieldError id={field('location-error')}>{fieldMessage(errors.location)}</FieldError>
            </Field>

            <Field data-invalid={!!errors.status}>
              <FieldLabel htmlFor={field('status')}>Status</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field: status }) => (
                  <Select value={status.value} onValueChange={(value) => status.onChange(value as Status)}>
                    <SelectTrigger id={field('status')} className={`w-full ${CONTROL}`} onBlur={status.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Controller
              control={form.control}
              name="referral"
              render={({ field: referral }) => (
                // Beside Status on the wide card, level with its box rather than its label.
                <Field orientation="horizontal" className="items-center gap-2.5 self-end min-[761px]:h-9">
                  <Checkbox
                    id={field('referral')}
                    checked={referral.value}
                    onCheckedChange={(checked) => referral.onChange(checked)}
                    onBlur={referral.onBlur}
                  />
                  <FieldLabel htmlFor={field('referral')} className="cursor-pointer font-normal">
                    Applied through a referral
                  </FieldLabel>
                </Field>
              )}
            />

            <Field data-invalid={!!errors.description} className={WIDE}>
              <FieldLabel htmlFor={field('description')}>Job description</FieldLabel>
              <Textarea
                id={field('description')}
                rows={3}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={describedBy(errors.description, 'description')}
                {...form.register('description')}
              />
              <FieldError id={field('description-error')}>{fieldMessage(errors.description)}</FieldError>
            </Field>

            {coverLetter ? <div className={WIDE}>{coverLetter}</div> : null}

            {showFirstNote ? (
              <Field data-invalid={!!errors.note} className={WIDE}>
                <FieldLabel htmlFor={field('note')}>First note (optional)</FieldLabel>
                <Textarea
                  id={field('note')}
                  rows={2}
                  aria-invalid={errors.note ? true : undefined}
                  aria-describedby={describedBy(errors.note, 'note')}
                  {...form.register('note')}
                />
                <FieldError id={field('note-error')}>{fieldMessage(errors.note)}</FieldError>
              </Field>
            ) : null}
          </FieldGroup>

          <div className="flex gap-2.5">
            <Button type="submit" size="lg" disabled={pending} className={ACTION}>
              {pending ? (
                <>
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                  Saving…
                </>
              ) : (
                submitLabel
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={ACTION}
              onClick={() => (isDirty || coverLetterChosen ? setConfirmDiscard(true) : onCancel())}
            >
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>

      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onCancel} />
    </>
  );
}
