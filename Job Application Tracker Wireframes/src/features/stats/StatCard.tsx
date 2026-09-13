import { cn } from '@/lib/utils';

/**
 * One stat (SPEC §4.5): a figure and its label. A `dt`/`dd` pair inside the
 * row's `dl`, so the two are read together. The figure sits on top to look at;
 * the label comes first to hear. Counts are the larger figures, rates the
 * smaller, as in the prototype; every figure is in the plain text colour.
 */
export function StatCard({ label, value, kind }: { label: string; value: string; kind: 'count' | 'rate' }) {
  return (
    <div className={cn('flex flex-col rounded-xl border text-center', kind === 'count' ? 'p-3' : 'p-2.5')}>
      <dt className="order-2 text-[13px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'order-1 font-heading font-semibold text-foreground tabular-nums',
          kind === 'count' ? 'text-2xl' : 'text-xl',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
