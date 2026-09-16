import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from './root';

/** `/` is the dashboard's address; the authenticated guard handles signed-out visitors. */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/applications', replace: true });
  },
});
