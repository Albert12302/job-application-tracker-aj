import type { StatusCount } from '@/domain/stats';
import { STATUS_TOKENS } from '@/domain/status';
import { cn } from '@/lib/utils';

/**
 * Applications by current status (SPEC §4.5): one segment per status, sized by
 * its count, in the §3 colours, with statuses that have none left out.
 *
 * The bar is a picture of the legend below it and hidden from assistive tech;
 * the legend names every status and its count in text, so no status is told by
 * colour alone (§10.1). The light fills are too close to the card to carry
 * meaning by contrast, which is why the legend is the content.
 */
export function BreakdownBar({ breakdown, labelledBy }: { breakdown: readonly StatusCount[]; labelledBy: string }) {
  return (
    <div>
      <div aria-hidden="true" className="flex h-[22px] overflow-hidden rounded-full bg-secondary">
        {breakdown.map(({ status, count }) => (
          // Grow by count from a zero basis, so widths stay proportional;
          // min-w keeps one application in thousands visible.
          <div key={status} className={cn('min-w-1 basis-0', STATUS_TOKENS[status].bg)} style={{ flexGrow: count }} />
        ))}
      </div>
      <ul aria-labelledby={labelledBy} className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
        {breakdown.map(({ status, count }) => (
          <li key={status}>
            {status} <span aria-hidden="true">·</span> {count.toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
