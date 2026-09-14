import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useId } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { nextCustomName } from '@/domain/filters';
import { savedFilterFormSchema, type SavedFilterFormValues } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { WAIT_A_MINUTE, WriteRateLimitedError } from '@/queries/use-saved-filters';
import { StatusChips } from './StatusChips';
import { TriStateChoice } from './TriStateChoice';

const CONTROL = 'h-9 max-[760px]:h-11';
const INPUT = 'h-9 bg-card max-[760px]:h-11';
const ANY_LOCATION = 'Any location';

const BLANK: SavedFilterFormValues = { name: '', text: '', location: null, statuses: [], referral: 'any', starred: 'any' };

/**
 * The filter builder (SPEC §4.2, §5.1): a collapsible panel under the tabs
 * that saves a filter as a new tab. Name, text match, location, statuses,
 * referral, starred — validated by the same schema the saved row is (§7.3).
 *
 * Location is a list of the places already used, not free text: a filter's
 * location must match exactly (§5.1), so a place no application has could
 * never match anything.
 *
 * A failed save keeps every choice (§8.2). The save itself belongs to the
 * screen, not this panel: what happens once it lands — the new tab made active,
 * the panel closed — must not depend on the panel still being open.
 */
export function FilterBuilder({
  id,
  locations,
  existingNames,
  pending,
  error,
  onSave,
  onCancel,
}: {
  id: string;
  locations: readonly string[];
  existingNames: readonly string[];
  pending: boolean;
  error: unknown;
  onSave: (values: SavedFilterFormValues) => void;
  onCancel: () => void;
}) {
  const field = useId();
  const form = useForm<SavedFilterFormValues>({ resolver: zodResolver(savedFilterFormSchema), defaultValues: BLANK });
  const { errors } = form.formState;
  const rateLimited = error instanceof WriteRateLimitedError;

  const save = form.handleSubmit(onSave);

  return (
    <section id={id} aria-labelledby={`${field}-heading`} className="rounded-xl border bg-card p-5 shadow-xs max-[760px]:p-4">
      <h2 id={`${field}-heading`} className="mb-4 font-heading text-[15px] font-semibold">
        New filter
      </h2>
      <form onSubmit={save} noValidate aria-busy={pending} className="flex flex-col gap-5">
        {error ? (
          <ErrorState
            title={rateLimited ? `Couldn't save the filter. ${WAIT_A_MINUTE}` : "Couldn't save the filter."}
            reference={rateLimited ? null : errorReference(error)}
          />
        ) : null}

        <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
          <div className="grid grid-cols-3 gap-3 max-[760px]:grid-cols-1">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor={`${field}-name`}>Name</FieldLabel>
              <Input
                id={`${field}-name`}
                className={INPUT}
                autoFocus
                autoComplete="off"
                maxLength={60}
                placeholder="e.g. Warm leads"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `${field}-name-error` : `${field}-name-help`}
                {...form.register('name')}
              />
              <FieldDescription id={`${field}-name-help`}>
                Optional. Left blank, it is called {nextCustomName(existingNames)}.
              </FieldDescription>
              <FieldError id={`${field}-name-error`}>{errors.name?.message}</FieldError>
            </Field>

            <Field data-invalid={!!errors.text}>
              <FieldLabel htmlFor={`${field}-text`}>Text match (optional)</FieldLabel>
              <Input
                id={`${field}-text`}
                className={INPUT}
                autoComplete="off"
                maxLength={120}
                aria-invalid={errors.text ? true : undefined}
                aria-describedby={errors.text ? `${field}-text-error` : `${field}-text-help`}
                {...form.register('text')}
              />
              <FieldDescription id={`${field}-text-help`}>Company, position, location, or description.</FieldDescription>
              <FieldError id={`${field}-text-error`}>{errors.text?.message}</FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${field}-location`}>Location</FieldLabel>
              <Controller
                control={form.control}
                name="location"
                render={({ field: location }) => (
                  <Select value={location.value} onValueChange={(value: string | null) => location.onChange(value)}>
                    <SelectTrigger id={`${field}-location`} className={`w-full ${INPUT}`} onBlur={location.onBlur}>
                      <SelectValue>{(value: string | null) => value ?? ANY_LOCATION}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>{ANY_LOCATION}</SelectItem>
                      {locations.map((place) => (
                        <SelectItem key={place} value={place}>
                          {place}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <Controller
            control={form.control}
            name="statuses"
            render={({ field: statuses }) => <StatusChips value={statuses.value} onChange={statuses.onChange} />}
          />

          <div className="flex flex-wrap gap-5">
            <Controller
              control={form.control}
              name="referral"
              render={({ field: referral }) => (
                <TriStateChoice
                  legend="Referral"
                  labels={{ any: 'Any', yes: 'Referral only', no: 'No referral' }}
                  value={referral.value}
                  onChange={referral.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="starred"
              render={({ field: starred }) => (
                <TriStateChoice
                  legend="Starred"
                  labels={{ any: 'Any', yes: 'Starred only', no: 'Not starred' }}
                  value={starred.value}
                  onChange={starred.onChange}
                />
              )}
            />
          </div>

          <div className="flex gap-2.5 max-[760px]:flex-col">
            <Button type="submit" className={CONTROL}>
              {pending ? (
                <>
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                  Saving…
                </>
              ) : (
                'Save filter'
              )}
            </Button>
            <Button type="button" variant="outline" className={CONTROL} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
