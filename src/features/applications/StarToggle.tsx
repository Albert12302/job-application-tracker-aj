import { StarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The star (SPEC §4.2). A real toggle button, so it is reachable by keyboard
 * and announces its state (§10.2); named for its application, because a list
 * holds many stars. Filled versus outline carries the state as well as colour
 * (§10.1), and below 760px the tap area is 44×44 around a 19px icon (§11).
 *
 * The click stops here, so toggling a star inside a row never opens the row.
 */
export function StarToggle({
  starred,
  company,
  onToggle,
  className,
}: {
  starred: boolean;
  company: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={`Star ${company}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        'inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted max-[760px]:size-11',
        starred ? 'text-star-on' : 'text-star-off',
        className,
      )}
    >
      <StarIcon aria-hidden="true" className={cn('size-4 max-[760px]:size-[19px]', starred && 'fill-current')} />
    </button>
  );
}
