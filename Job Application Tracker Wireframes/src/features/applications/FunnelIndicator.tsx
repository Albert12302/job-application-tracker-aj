import { useId } from 'react';
import { FUNNEL, funnelIndex, isTerminal, type Status } from '@/domain/status';
import { cn } from '@/lib/utils';

/**
 * How far the application has got, across Applied → Interview → Callback →
 * Offer (SPEC §3, §4.4). Rejected and Withdrawn sit outside the funnel, so no
 * step is marked and a line says what happened instead.
 *
 * An ordered list, with the current step marked — the bars are decoration, and
 * every step is readable as text (§10.1).
 */
export function FunnelIndicator({ status }: { status: Status }) {
  const labelId = useId();
  const reachedUpTo = funnelIndex(status);

  return (
    <div className="flex flex-col gap-2">
      <h2 id={labelId} className="text-[13px] font-semibold text-muted-foreground">
        Progress
      </h2>
      <ol aria-labelledby={labelId} className="grid grid-cols-4 gap-1.5">
        {FUNNEL.map((step, index) => {
          const reached = reachedUpTo >= index;
          return (
            <li key={step} aria-current={reachedUpTo === index ? 'step' : undefined} className="flex flex-col gap-1.5">
              <span aria-hidden="true" className={cn('h-2 rounded-full', reached ? 'bg-primary' : 'bg-muted')} />
              <span className={cn('text-xs', reached ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {step}
                {reachedUpTo === index ? <span className="sr-only"> (current)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {isTerminal(status) ? <p className="text-[13px] text-muted-foreground">{status}</p> : null}
    </div>
  );
}
