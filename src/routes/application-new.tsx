import { createRoute } from '@tanstack/react-router';
import { AddApplicationScreen } from '@/features/applications/AddApplicationScreen';
import { authenticatedRoute } from './authenticated';
import { pageTitle } from './title';

export const applicationNewRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications/new',
  head: () => ({ meta: [{ title: pageTitle('Add application') }] }),
  component: AddApplicationScreen,
});
