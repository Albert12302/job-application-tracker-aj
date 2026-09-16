import { createRoute } from '@tanstack/react-router';
import { AddApplicationScreen } from '@/features/applications/AddApplicationScreen';
import { authenticatedRoute } from './authenticated';

export const applicationNewRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications/new',
  component: AddApplicationScreen,
});
