import { createRoute } from '@tanstack/react-router';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { authenticatedRoute } from './authenticated';
import { pageTitle } from './title';

export const profileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/profile',
  head: () => ({ meta: [{ title: pageTitle('Profile') }] }),
  component: ProfileScreen,
});
