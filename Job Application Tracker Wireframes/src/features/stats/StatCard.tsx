import { percentOf } from '@/domain/stats';

/**
 * One funnel stat (SPEC §4.5): its count, and that count as a share of every
 * application. A `dt`/`dd` group inside the screen's `dl`, so the label, the
 * count, and the percentage are read together. The count sits on top to look
 * at; the label comes first to hear.
 */
export function StatCard({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <div className="flex flex-col items-center rounded-xl border px-2 py-3 text-center">
      <dt className="order-2 text-[13px] text-muted-foreground">{label}</dt>
      <dd className="order-1 font-heading text-2xl font-semibold tabular-nums">{count.toLocaleString()}</dd>
      <dd className="order-3 text-[13px] font-medium tabular-nums">
        {percentOf(count, total)}%<span className="sr-only"> of applications</span>
      </dd>
    </div>
  );
}
