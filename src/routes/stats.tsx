import { createRoute } from '@tanstack/react-router';
import { StatsScreen } from '@/features/stats/StatsScreen';
import { authenticatedRoute } from './authenticated';
import { pageTitle } from './title';

export const statsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/stats',
  head: () => ({ meta: [{ title: pageTitle('Your Stats') }] }),
  component: StatsScreen,
});
