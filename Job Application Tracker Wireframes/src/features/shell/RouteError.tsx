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
        <Button className="h-9 max-[760px]:h-11" onClick={() => void router.invalidate()}>
          Retry
        </Button>
        <Link to="/applications" className={buttonVariants({ variant: 'outline', className: 'h-9 max-[760px]:h-11' })}>
          Back to applications
        </Link>
      </ErrorState>
    </main>
  );
}
