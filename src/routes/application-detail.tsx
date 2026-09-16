import { createRoute } from '@tanstack/react-router';
import { ApplicationDetailScreen } from '@/features/applications/ApplicationDetailScreen';
import { authenticatedRoute } from './authenticated';

export const applicationDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications/$id',
  component: ApplicationDetailScreen,
});
