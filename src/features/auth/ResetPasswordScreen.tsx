import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { recoveryLink } from '@/data/auth';
import { AuthCard } from './AuthCard';
import { ResetPasswordForm } from './ResetPasswordForm';

/**
 * SPEC §4.1d. What the screen shows is decided by what the page load arrived
 * with, read once in data/auth.ts before anything rendered — not by the session,
 * because the app deliberately never takes one from a recovery link.
 *
 * A spent link and a typed address are both dead ends without a next step
 * (§8.1), so both get the same one: ask for another link.
 */
export function ResetPasswordScreen() {
  if (recoveryLink.status === 'ready') {
    return (
      <AuthCard subtitle="Set a new password">
        <ResetPasswordForm />
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Set a new password">
      <div role="status" className="flex flex-col gap-2 text-center">
        <p className="text-sm">
          {recoveryLink.status === 'invalid'
            ? 'That reset link has expired or has already been used.'
            : 'Open the link in your password reset email to set a new password.'}
        </p>
        <p className="text-sm text-muted-foreground">Links expire 60 minutes after they are sent.</p>
      </div>
      {/* A Link with buttonVariants, never a Button: rendering a link through
          Button gives it role="button" and takes its link role away. */}
      <Link
        to="/forgot-password"
        className={buttonVariants({ size: 'lg', className: 'h-9 w-full max-[760px]:h-11' })}
      >
        Request a new link
      </Link>
      <Link
        to="/sign-in"
        className="self-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
