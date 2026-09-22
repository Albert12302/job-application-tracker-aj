import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { useRequestPasswordReset } from '@/queries/use-mutations';

const ERROR_ID = 'forgot-password-error';

/**
 * SPEC §4.1c. One field, one button, and one answer: the caller learns whether
 * the request was made, never whether the address has an account (§7.1).
 *
 * The only failure it can show is not having been able to ask at all. Anything
 * Auth answered — including its own send limit — counts as asked, because a
 * message that appears for some addresses and not others is the enumeration
 * this screen exists to avoid.
 */
export function ForgotPasswordForm({ onSent }: { onSent: () => void }) {
  const request = useRequestPasswordReset();
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const { errors, submitCount } = form.formState;

  const validation = errors.email?.message;
  const message =
    validation ?? (request.error ? "Couldn't send the link. Check your connection and try again." : null);
  const reference = validation ? null : errorReference(request.error);
  const pending = request.isPending;

  const onSubmit = form.handleSubmit((values) => request.mutate(values, { onSuccess: onSent }));

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending} className="flex flex-col gap-4">
      <p className="text-sm">Enter your email and we'll send a link to set a new password.</p>

      {message ? (
        // Keyed per attempt so a repeated message is announced again.
        <Alert key={`${submitCount}-${request.submittedAt}`} id={ERROR_ID} variant="destructive">
          <AlertDescription className="text-destructive">
            {message}
            {reference ? <> Error reference <span className="font-mono">{reference}</span>.</> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={pending} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
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
            aria-describedby={errors.email ? ERROR_ID : undefined}
            className="h-9 max-[760px]:h-11"
            {...form.register('email')}
          />
        </Field>

        <Button type="submit" disabled={pending} className="h-9 w-full max-[760px]:h-11">
          {pending ? (
            <>
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Sending…
            </>
          ) : (
            'Send reset link'
          )}
        </Button>
      </fieldset>
    </form>
  );
}
