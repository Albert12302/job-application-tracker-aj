import { createRoute } from '@tanstack/react-router';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { authenticatedRoute } from './authenticated';

export const profileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/profile',
  head: () => ({ meta: [{ title: 'Profile' }] }),
  component: ProfileScreen,
});
