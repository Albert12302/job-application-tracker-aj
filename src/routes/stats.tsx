import { createRoute } from '@tanstack/react-router';
import { StatsScreen } from '@/features/stats/StatsScreen';
import { authenticatedRoute } from './authenticated';

export const statsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/stats',
  head: () => ({ meta: [{ title: 'Your Stats' }] }),
  component: StatsScreen,
});
