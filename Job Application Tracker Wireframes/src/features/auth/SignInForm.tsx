import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { signInSchema, type SignInValues } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { SignInError, useSignIn, type SignInFailure } from '@/queries/use-mutations';

/**
 * Copy for each outcome of the sign-in function's contract. `invalid` is one
 * message for a wrong password and an unknown email alike (§7.1: no account
 * enumeration). The client owns every word; the function's body is not shown.
 */
const FAILURE_COPY: Record<Exclude<SignInFailure, 'locked'>, string> = {
  missing: 'Enter an email and password.',
  invalid: 'That email and password combination is incorrect.',
  unavailable: "Couldn't sign you in. Check your connection and try again.",
};

/**
 * A block lasts 15 minutes for an account but up to an hour for an address,
 * so the wait comes from the function rather than being promised here. The
 * copy is the same for both: it never says which limit tripped.
 */
function failureCopy(error: unknown): string {
  if (!(error instanceof SignInError)) return FAILURE_COPY.unavailable;
  if (error.reason !== 'locked') return FAILURE_COPY[error.reason];
  const minutes = error.retryAfterMinutes;
  return minutes
    ? `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
    : 'Too many attempts. Try again later.';
}

const ERROR_ID = 'sign-in-error';

export function SignInForm() {
  const signIn = useSignIn();
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, submitCount } = form.formState;

  // Both fields carry the same message (§4.1), so it is shown once, above the
  // form (§8.2), and each empty field points at it.
  const validation = errors.email?.message ?? errors.password?.message;
  const message = validation ?? (signIn.error ? failureCopy(signIn.error) : null);
  const reference = validation ? null : errorReference(signIn.error);
  const pending = signIn.isPending;

  const onSubmit = form.handleSubmit((values) => signIn.mutate(values));
  const describedBy = message ? ERROR_ID : undefined;

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      {message ? (
        // Keyed per attempt so a repeated message is announced again.
        <Alert key={`${submitCount}-${signIn.submittedAt}`} id={ERROR_ID} variant="destructive">
          <AlertDescription className="text-destructive">
            {message}
            {reference ? <> Error reference <span className="font-mono">{reference}</span>.</> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? describedBy : undefined}
              className="h-9 max-[760px]:h-11"
              {...form.register('email')}
            />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? describedBy : undefined}
              className="h-9 max-[760px]:h-11"
              {...form.register('password')}
            />
          </Field>
        </FieldGroup>

        <Button type="submit" disabled={pending} className="h-9 w-full max-[760px]:h-11">
          {pending ? (
            <>
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </fieldset>
    </form>
  );
}
