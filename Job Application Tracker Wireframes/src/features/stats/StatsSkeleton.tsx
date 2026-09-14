import { Skeleton } from '@/components/ui/skeleton';
import { STAT_GRID } from './layout';

const CARDS = [0, 1, 2, 3];

/**
 * Skeleton bars at the real layout's fixed heights (SPEC §8.2), so nothing
 * moves when the numbers land. Hidden from screen readers; the screen
 * announces "Loading" instead.
 */
export function StatsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`${STAT_GRID} mb-4`}>
        {CARDS.map((card) => (
          <Skeleton key={card} className="h-[78px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mb-0.5 h-7 w-52" />
      <div className={`${STAT_GRID} mb-4`}>
        {CARDS.map((card) => (
          <Skeleton key={card} className="h-[70px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="h-[22px] rounded-full" />
      <Skeleton className="mt-2 h-5 w-3/4" />
    </div>
  );
}
