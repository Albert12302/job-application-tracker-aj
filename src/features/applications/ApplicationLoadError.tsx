import { Link } from '@tanstack/react-router';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { errorReference } from '@/queries/errors';
import { useListReturn } from './list-return';

/** One application failed to load (§8.2) — the detail and edit screens alike. */
export function ApplicationLoadError({
  className,
  error,
  onRetry,
}: {
  className: string;
  error: unknown;
  onRetry: () => void;
}) {
  const listSearch = useListReturn();
  return (
    <div className={className}>
      <ErrorState title="Couldn't load this application." reference={errorReference(error)}>
        <Button size="lg" onClick={onRetry}>
          Retry
        </Button>
        <Link to="/applications" search={listSearch} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Back to list
        </Link>
      </ErrorState>
    </div>
  );
}
