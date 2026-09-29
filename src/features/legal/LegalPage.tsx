import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { APP_NAME } from '@/lib/app-name';
import { LEGAL_UPDATED } from './contact';

/**
 * The page both documents sit on (SPEC §4.7). Outside AppShell and AuthCard
 * alike, because either kind of visitor reads it: someone deciding whether to
 * accept an invitation, and someone already signed in.
 *
 * "Back" goes to `/`, which lands a signed-in visitor on the list and sends a
 * signed-out one to sign-in — the page does not need to know which it has.
 */
export function LegalPage({
  title,
  other,
  children,
}: {
  title: string;
  other: { to: '/privacy' | '/terms'; label: string };
  children: ReactNode;
}) {
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 max-[760px]:px-3.5">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm font-medium text-link underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Back to {APP_NAME}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      </header>
      <div className="flex flex-col gap-7 text-[15px] leading-relaxed">{children}</div>
      <footer className="border-t pt-5 text-sm">
        <Link
          to={other.to}
          className="inline-flex min-h-11 items-center rounded-sm text-link underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {other.label}
        </Link>
      </footer>
    </main>
  );
}
