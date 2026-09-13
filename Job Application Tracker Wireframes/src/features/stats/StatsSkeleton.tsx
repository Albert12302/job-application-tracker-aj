import { Skeleton } from '@/components/ui/skeleton';
import { STAT_GRID } from './layout';

/**
 * Skeleton bars at the real layout's fixed heights (SPEC §8.2), so nothing
 * moves when the numbers land. Hidden from screen readers; the screen
 * announces "Loading" instead.
 */
export function StatsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      <Skeleton className="h-8 w-36" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <div className={STAT_GRID}>
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} className="h-[95px] rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-[22px] rounded-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
