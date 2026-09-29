import { createRoute } from '@tanstack/react-router';
import { PrivacyScreen } from '@/features/legal/PrivacyScreen';
import { rootRoute } from './root';

/** SPEC §4.7. No guard: it has to be readable before anyone has an account. */
export const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/privacy',
  head: () => ({ meta: [{ title: 'Privacy policy' }] }),
  component: PrivacyScreen,
});
