import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { useListReturn } from './list-return';

/**
 * Missing and not this user's read the same (§8.2), on the detail and edit
 * screens alike.
 */
export function ApplicationNotFound({ className }: { className: string }) {
  const listSearch = useListReturn();
  return (
    <div className={className}>
      <h1 className="font-heading text-lg font-semibold">Application not found</h1>
      <p className="text-sm text-muted-foreground">It may have been deleted, or the link may be wrong.</p>
      <Link
        to="/applications"
        search={listSearch}
        className={buttonVariants({ variant: 'outline', size: 'lg', className: 'w-fit' })}
      >
        Back to applications
      </Link>
    </div>
  );
}
