import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import type { Stats } from '@/domain/stats';
import { errorReference } from '@/queries/errors';
import { useStats } from '@/queries/use-stats';
import { BreakdownBar } from './BreakdownBar';
import { StatCard } from './StatCard';
import { StatsSkeleton } from './StatsSkeleton';
import { SECTION_HEADING, STAT_GRID, STATS_PANEL } from './layout';

/**
 * Stats (SPEC §4.5) over every application the user has (§5.3). The three
 * states are §8.2's, inside the panel, so the header and nav stay usable in all
 * of them.
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
      <h1 id="stats-heading" className="font-heading text-xl font-semibold">
        Your Stats
      </h1>
      {content}
    </section>
  );
}

function StatsSummary({ stats }: { stats: Stats }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <span className="font-heading text-2xl font-semibold text-foreground tabular-nums">{stats.total.toLocaleString()}</span>{' '}
        {stats.total === 1 ? 'application' : 'applications'}
      </p>

      <div className="flex flex-col gap-2">
        <h2 id="stats-reach-heading" className={SECTION_HEADING}>
          How far applications got
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Each application counts for the furthest stage it reached, even if it later closed.
        </p>
        <dl aria-labelledby="stats-reach-heading" className={STAT_GRID}>
          <StatCard label="Interviewed" count={stats.interviewed} total={stats.total} />
          <StatCard label="Callbacks" count={stats.callbacks} total={stats.total} />
          <StatCard label="Offers" count={stats.offers} total={stats.total} />
          <StatCard label="Heard back" count={stats.heardBack} total={stats.total} />
        </dl>
      </div>

      <div className="flex flex-col gap-2">
        <h2 id="stats-breakdown-heading" className={SECTION_HEADING}>
          Status breakdown
        </h2>
        <BreakdownBar breakdown={stats.breakdown} labelledBy="stats-breakdown-heading" />
      </div>
    </>
  );
}
