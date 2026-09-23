import { Link } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AuthCard } from './AuthCard';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/**
 * SPEC §4.1c. Two states, and the second is the only answer this screen ever
 * gives: the same sentence for an address with an account and one without
 * (§7.1). It is not in the URL, so a reload returns to the form — which is
 * also the way back for a typo.
 */
export function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);

  if (!sent) {
    return (
      <AuthCard subtitle="Reset your password">
        <ForgotPasswordForm onSent={() => setSent(true)} />
        <BackToSignIn />
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="Reset your password">
      <Confirmation />
      <BackToSignIn />
    </AuthCard>
  );
}

function Confirmation() {
  // The form it replaced held focus, so the answer takes it — otherwise a
  // screen reader is left on a button that no longer exists (§10.2).
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div role="status" className="flex flex-col items-center gap-3 text-center">
      <MailIcon aria-hidden="true" className="size-10 text-primary" />
      <p ref={heading} tabIndex={-1} className="text-sm outline-none">
        If that email has an account, we've sent a link to reset the password.
      </p>
      <p className="text-sm text-muted-foreground">
        Check spam before requesting another. Links expire in 60 minutes.
      </p>
    </div>
  );
}

function BackToSignIn() {
  return (
    <Link
      to="/sign-in"
      className="self-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      Back to sign in
    </Link>
  );
}
