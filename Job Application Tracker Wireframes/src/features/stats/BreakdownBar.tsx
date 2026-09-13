import type { StatusCount } from '@/domain/stats';
import { STATUS_TOKENS } from '@/domain/status';
import { cn } from '@/lib/utils';

/**
 * Applications by current status (SPEC §4.5): one segment per status, sized by
 * its count, in the §3 colours, with statuses that have none left out.
 *
 * The bar is a picture of the legend below it and hidden from assistive tech;
 * the legend names every status and its count in text, so no status is told by
 * colour alone (§10.1). The bar's edge uses the control-border token, so its
 * extent shows even when every segment is a light fill.
 */
export function BreakdownBar({ breakdown, labelledBy }: { breakdown: readonly StatusCount[]; labelledBy: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden="true" className="flex h-[22px] gap-0.5 overflow-hidden rounded-full border border-input bg-card">
        {breakdown.map(({ status, count }) => (
          // Grow by count from a zero basis, so segment widths stay proportional
          // however many gaps there are; min-w keeps one application in thousands visible.
          <div key={status} className={cn('min-w-1 basis-0', STATUS_TOKENS[status].bg)} style={{ flexGrow: count }} />
        ))}
      </div>
      <ul aria-labelledby={labelledBy} className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
        {breakdown.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('size-3 rounded-full border border-input', STATUS_TOKENS[status].bg)} />
            <span>{status}</span> <span aria-hidden="true" className="text-muted-foreground">·</span>{' '}
            <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
