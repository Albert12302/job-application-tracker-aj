import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';

export function NotFound() {
  return (
    <main id="main" className="mx-auto flex max-w-md flex-col items-start gap-3 px-4 py-10">
      <h1 className="font-heading text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That address doesn't match anything in the app.</p>
      <Link to="/applications" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        Back to applications
      </Link>
    </main>
  );
}
