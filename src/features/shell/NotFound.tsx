import { Link } from '@tanstack/react-router';
import { LegalLinks } from '@/components/LegalLinks';
import { buttonVariants } from '@/components/ui/button';

/**
 * An address that matches nothing. It renders with only the root route matched,
 * so outside AppShell — which is why it carries its own footer (SPEC §4.7).
 */
export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col items-start gap-3 px-4 py-10">
        <h1 className="font-heading text-lg font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">That address doesn't match anything in the app.</p>
        <Link to="/applications" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Back to applications
        </Link>
      </main>
      <footer className="py-4">
        <LegalLinks />
      </footer>
    </div>
  );
}
