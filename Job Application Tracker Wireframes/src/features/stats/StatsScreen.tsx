import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { percentOf, type Stats } from '@/domain/stats';
import { errorReference } from '@/queries/errors';
import { useStats } from '@/queries/use-stats';
import { BreakdownBar } from './BreakdownBar';
import { StatCard } from './StatCard';
import { StatsSkeleton } from './StatsSkeleton';
import { SECTION_HEADING, STAT_GRID, STATS_PANEL } from './layout';

/**
 * Stats (SPEC §4.5) over every application the user has (§5.3), laid out as
 * the prototype has it. The three states are §8.2's, inside the panel, so the
 * header and nav stay usable in all of them.
 */
export function StatsScreen() {
  const stats = useStats();

  let content;
  if (stats.isPending) {
    content = (
      <div aria-busy="true">
        <p role="status" className="sr-only">
          Loading your stats
        </p>
        <StatsSkeleton />
      </div>
    );
  } else if (stats.isError) {
    content = (
      <ErrorState title="Couldn't load stats." reference={errorReference(stats.error)}>
        <Button className="h-9 max-[760px]:h-11" disabled={stats.isFetching} onClick={() => void stats.refetch()}>
          {stats.isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </ErrorState>
    );
  } else if (stats.data.total === 0) {
    // Zero applications is this state, never a chart of zeros or a divide by zero (§4.5).
    content = (
      <EmptyState title="Nothing to chart yet" className="py-6">
        Add your first application to see stats.
      </EmptyState>
    );
  } else {
    content = <StatsSummary stats={stats.data} />;
  }

  return (
    <section aria-labelledby="stats-heading" className={STATS_PANEL}>
      <h1 id="stats-heading" className="mb-4 font-heading text-xl font-semibold">
        Your Stats
      </h1>
      {content}
    </section>
  );
}

function StatsSummary({ stats }: { stats: Stats }) {
  const rate = (count: number) => `${percentOf(count, stats.total)}%`;

  return (
    <>
      <dl className={`${STAT_GRID} mb-4`}>
        <StatCard kind="count" label="Applications" value={stats.total.toLocaleString()} />
        <StatCard kind="count" label="Interviews" value={stats.interviewed.toLocaleString()} />
        <StatCard kind="count" label="Callbacks" value={stats.callbacks.toLocaleString()} />
        <StatCard kind="count" label="Via referral" value={rate(stats.referrals)} />
      </dl>

      <h2 id="stats-reach-heading" className={`${SECTION_HEADING} mb-0.5`}>
        How far applications got
      </h2>
      <dl aria-labelledby="stats-reach-heading" className={`${STAT_GRID} mb-4`}>
        <StatCard kind="rate" label="Heard back" value={rate(stats.heardBack)} />
        <StatCard kind="rate" label="Interview rate" value={rate(stats.interviewed)} />
        <StatCard kind="rate" label="Callback rate" value={rate(stats.callbacks)} />
        <StatCard kind="rate" label="Offer rate" value={rate(stats.offers)} />
      </dl>

      <h2 id="stats-breakdown-heading" className={`${SECTION_HEADING} mb-2`}>
        Status breakdown
      </h2>
      <BreakdownBar breakdown={stats.breakdown} labelledBy="stats-breakdown-heading" />
    </>
  );
}
