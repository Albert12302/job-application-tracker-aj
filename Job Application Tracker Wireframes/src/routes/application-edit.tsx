import { createRoute } from '@tanstack/react-router';
import { EditApplicationScreen } from '@/features/applications/EditApplicationScreen';
import { authenticatedRoute } from './authenticated';

export const applicationEditRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications/$id/edit',
  component: EditApplicationScreen,
});
