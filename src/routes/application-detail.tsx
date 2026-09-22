import { createRoute } from '@tanstack/react-router';
import { ApplicationDetailScreen } from '@/features/applications/ApplicationDetailScreen';
import { authenticatedRoute } from './authenticated';
import { pageTitle } from './title';

export const applicationDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications/$id',
  head: () => ({ meta: [{ title: pageTitle('Application') }] }),
  component: ApplicationDetailScreen,
});
