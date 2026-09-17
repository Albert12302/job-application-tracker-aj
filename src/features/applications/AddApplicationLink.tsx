import { Link } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

/** A link, not a button: it goes somewhere (§4.3), so it can be opened in a new tab. */
export function AddApplicationLink({ className }: { className?: string }) {
  return (
    <Link to="/applications/new" className={buttonVariants({ size: 'lg', className })}>
      <PlusIcon aria-hidden="true" />
      Add application
    </Link>
  );
}
