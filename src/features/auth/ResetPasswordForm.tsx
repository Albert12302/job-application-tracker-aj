import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { resetPasswordSchema, type ResetPasswordValues } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { PasswordResetError, useResetPassword, type PasswordResetFailure } from '@/queries/use-mutations';

/**
 * Copy for each outcome the reset can have (§8.2). `invalid-link` can arrive
 * here as well as on load: a link can expire between opening the screen and
 * saving, and 60 minutes is long enough for that to happen to a real person.
 */
const FAILURE_COPY: Record<PasswordResetFailure, string> = {
  'invalid-link': 'That reset link has expired or has already been used. Request a new one to try again.',
  'same-password': "Choose a password you haven't used for this account before.",
  'weak-password': 'Choose a longer or less common password.',
  unavailable: "Couldn't save your new password. Check your connection and try again.",
};

function failureCopy(error: unknown): string {
  return error instanceof PasswordResetError ? FAILURE_COPY[error.reason] : FAILURE_COPY.unavailable;
}

const ERROR_ID = 'reset-password-error';

/**
 * SPEC §4.1d. The same rules and the same words as sign-up's password fields,
 * from the same schema.
 *
 * On success it goes to sign-in rather than into the app: the reset ends every
 * session the account has, its own link included, so there is nothing to go in
 * with — and a password someone else requested should not hand them the app.
 */
export function ResetPasswordForm() {
  const navigate = useNavigate();
  const reset = useResetPassword();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors, submitCount } = form.formState;

  // Validation order is the schema's: length first, then the match (§4.1a).
  const validation = errors.password?.message ?? errors.confirm?.message;
  const message = validation ?? (reset.error ? failureCopy(reset.error) : null);
  const reference = validation ? null : errorReference(reset.error);
  const pending = reset.isPending || reset.isSuccess;

  const onSubmit = form.handleSubmit((values) =>
    reset.mutate(values, {
      onSuccess: () => void navigate({ to: '/sign-in', search: { reset: true }, replace: true }),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      {message ? (
        <Alert key={`${submitCount}-${reset.submittedAt}`} id={ERROR_ID} variant="destructive">
          <AlertDescription className="text-destructive">
            {message}
            {reference ? <> Error reference <span className="font-mono">{reference}</span>.</> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? ERROR_ID : undefined}
              className="h-9 max-[760px]:h-11"
              {...form.register('password')}
            />
            <FieldDescription>
              At least 12 characters. A passphrase you can remember beats a short, complicated one.
            </FieldDescription>
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={errors.confirm ? ERROR_ID : undefined}
              className="h-9 max-[760px]:h-11"
              {...form.register('confirm')}
            />
          </Field>
        </FieldGroup>

        <p className="text-sm text-muted-foreground">Saving this signs out every other device.</p>

        <Button type="submit" disabled={pending} className="h-9 w-full max-[760px]:h-11">
          {pending ? (
            <>
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Saving…
            </>
          ) : (
            'Save new password'
          )}
        </Button>
      </fieldset>
    </form>
  );
}
