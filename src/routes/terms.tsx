import { createRoute } from '@tanstack/react-router';
import { TermsScreen } from '@/features/legal/TermsScreen';
import { rootRoute } from './root';

/** SPEC §4.7. No guard, like the privacy policy. */
export const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  head: () => ({ meta: [{ title: 'Terms of use' }] }),
  component: TermsScreen,
});
