import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { useErrorReference } from '@/queries/errors';

/** A render or route-load failure: reported once, never a blank screen (§8). */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const reference = useErrorReference(error, 'render');

  return (
    <main id="main" className="mx-auto max-w-md px-4 py-10">
      <ErrorState title="Something went wrong on this screen." reference={reference}>
        <Button size="lg" onClick={() => void router.invalidate()}>
          Retry
        </Button>
        <Link to="/applications" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Back to applications
        </Link>
      </ErrorState>
    </main>
  );
}
