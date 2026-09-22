import { useSearch } from '@tanstack/react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AuthCard } from './AuthCard';
import { SignInForm } from './SignInForm';

/**
 * SPEC §4.1. "Create one" is still not rendered — sign-up is gated (§4.1d), and
 * a link to a screen that does not exist is a dead end (§8.1). "Forgot
 * password?" is, now that §4.1c–d are built; it lives in the form, under the
 * password field it belongs to.
 */
export function SignInScreen() {
  const expired = useSearch({ from: '/sign-in', select: (search) => search.expired === true });
  const deleted = useSearch({ from: '/sign-in', select: (search) => search.deleted === true });
  const reset = useSearch({ from: '/sign-in', select: (search) => search.reset === true });
  return (
    <AuthCard subtitle="Sign in to your account">
      {deleted ? (
        // §9.7. A status, not an alert: this is the outcome that was asked for.
        <Alert role="status" className="border-accent bg-accent">
          <AlertDescription className="text-accent-foreground">
            Your account and data have been deleted.
          </AlertDescription>
        </Alert>
      ) : null}
      {reset ? (
        // §4.1d. Also the outcome that was asked for — and the reason the new
        // password is not already signing them in.
        <Alert role="status" className="border-accent bg-accent">
          <AlertDescription className="text-accent-foreground">
            Password updated. Sign in with your new password.
          </AlertDescription>
        </Alert>
      ) : null}
      {expired ? (
        // §8.2 "Session expired". A status, not an alert: nothing went wrong on this page.
        <Alert role="status" className="border-accent bg-accent">
          <AlertDescription className="text-accent-foreground">
            Your session expired. Sign in to continue.
          </AlertDescription>
        </Alert>
      ) : null}
      <SignInForm />
    </AuthCard>
  );
}
