import { createRoute } from '@tanstack/react-router';
import { EditApplicationScreen } from '@/features/applications/EditApplicationScreen';
import { authenticatedRoute } from './authenticated';
import { pageTitle } from './title';

export const applicationEditRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications/$id/edit',
  head: () => ({ meta: [{ title: pageTitle('Edit application') }] }),
  component: EditApplicationScreen,
});
