import { cn } from '@/lib/utils';

/** Which figure's colour a card uses, as the prototype pairs them (§4.5). Measured in globals.css. */
export type StatTone = 'total' | 'interview' | 'callback' | 'offer';

const TONES: Record<StatTone, string> = {
  total: 'text-link',
  interview: 'text-status-interview-fg',
  callback: 'text-status-callback-fg',
  offer: 'text-stat-offer',
};

/**
 * One stat (SPEC §4.5): a figure and its label. A `dt`/`dd` pair inside the
 * row's `dl`, so the two are read together. The figure sits on top to look at;
 * the label comes first to hear. Counts are the larger figures, rates the
 * smaller, as in the prototype.
 */
export function StatCard({
  label,
  value,
  tone,
  kind,
}: {
  label: string;
  value: string;
  tone: StatTone;
  kind: 'count' | 'rate';
}) {
  return (
    <div className={cn('flex flex-col rounded-xl border text-center', kind === 'count' ? 'p-3' : 'p-2.5')}>
      <dt className="order-2 text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'order-1 font-heading font-semibold tabular-nums',
          kind === 'count' ? 'text-2xl' : 'text-xl',
          TONES[tone],
        )}
      >
        {value}
      </dd>
    </div>
  );
}
