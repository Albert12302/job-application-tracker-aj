import { useSearch } from '@tanstack/react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { SignInForm } from './SignInForm';

/**
 * SPEC §4.1. The "Create one" and "Forgot password?" links are not rendered
 * yet: sign-up is gated (§4.1d) and the reset screens are not built, so either
 * link would lead nowhere.
 */
export function SignInScreen() {
  const expired = useSearch({ from: '/sign-in', select: (search) => search.expired === true });
  const deleted = useSearch({ from: '/sign-in', select: (search) => search.deleted === true });
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <Card className="w-full max-w-[340px] gap-5 px-1.5 py-6 shadow-xs">
        <CardHeader className="justify-items-center text-center">
          <h1 className="font-heading text-xl font-semibold">AJ's Hunt</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {deleted ? (
            // §9.7. A status, not an alert: this is the outcome that was asked for.
            <Alert role="status" className="border-accent bg-accent">
              <AlertDescription className="text-accent-foreground">
                Your account and data have been deleted.
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
        </CardContent>
      </Card>
    </main>
  );
}
