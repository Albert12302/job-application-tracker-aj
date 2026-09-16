import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplicationCount } from '@/queries/use-profile';

export function ApplicationCount() {
  const count = useApplicationCount();

  if (count.isPending) {
    return (
      <>
        <Skeleton aria-hidden="true" className="h-4 w-36" />
        <span className="sr-only">Loading application count</span>
      </>
    );
  }

  if (count.isError) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn't load your application count.{' '}
        <Button variant="link" className="h-auto p-0 text-link max-[760px]:min-h-11" onClick={() => void count.refetch()}>
          Retry
        </Button>
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {count.data === 1 ? '1 application tracked' : `${count.data.toLocaleString()} applications tracked`}
    </p>
  );
}
