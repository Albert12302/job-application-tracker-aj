import { createRoute, stripSearchParams } from '@tanstack/react-router';
import { applicationsSearchSchema } from '@/domain/schemas';
import { ApplicationsScreen } from '@/features/applications/ApplicationsScreen';
import { authenticatedRoute } from './authenticated';
import { pageTitle } from './title';

export const applicationsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/applications',
  validateSearch: applicationsSearchSchema,
  // Params at their default stay out of the URL: the default view is plain
  // /applications, and a shared link carries only what was actually chosen.
  search: { middlewares: [stripSearchParams(applicationsSearchSchema.parse({}))] },
  head: () => ({ meta: [{ title: pageTitle('My Applications') }] }),
  component: ApplicationsScreen,
});
