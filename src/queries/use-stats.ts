import { useQuery } from '@tanstack/react-query';
import { listStatsApplications } from '@/data/applications';
import { listStatusHistory } from '@/data/status-history';
import { computeStats } from '@/domain/stats';
import { reporting } from './errors';
import { keys } from './keys';
import { useIsSignedIn, useSignedInUser } from './use-session';

/**
 * The stats screen (SPEC §4.5): the whole application set and its history,
 * read together and counted in domain/stats.ts. Never the list's page or search
 * (§5.3) — this reads the few columns it needs rather than borrowing the list cache.
 */
export function useStats() {
  const user = useSignedInUser();
  return useQuery({
    queryKey: keys.stats(user.id),
    queryFn: () =>
      reporting('load_stats', async () => {
        const [applications, history] = await Promise.all([listStatsApplications(user.id), listStatusHistory()]);
        return computeStats(applications, history);
      }),
    enabled: useIsSignedIn(),
    // Seconds old is fine (CLAUDE.md); every add, status change, edit, and delete invalidates it.
    staleTime: 30_000,
  });
}
