import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFileSize } from '@/domain/cover-letter';
import { errorReference } from '@/queries/errors';
import { useCoverLetterSize } from '@/queries/use-cover-letter';

/** The stored file's size under its name (§4.4), with its own loading and error states (§8.2). */
export function CoverLetterSize({ path }: { path: string }) {
  const size = useCoverLetterSize(path);

  if (size.isPending) {
    return (
      <>
        <Skeleton aria-hidden="true" className="mt-1 h-3.5 w-14" />
        <span className="sr-only">Loading the file size</span>
      </>
    );
  }

  if (size.isError) {
    const reference = errorReference(size.error);
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-destructive">
        Couldn't load the file size.
        {reference ? (
          <span className="text-muted-foreground">
            Error reference <span className="font-mono">{reference}</span>
          </span>
        ) : null}
        <Button variant="link" className="h-auto p-0 text-link max-[760px]:min-h-11" onClick={() => void size.refetch()}>
          Retry
        </Button>
      </p>
    );
  }

  return <p className="text-[13px] text-muted-foreground">{formatFileSize(size.data)}</p>;
}
