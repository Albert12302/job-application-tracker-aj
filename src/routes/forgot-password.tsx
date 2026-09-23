import { createRoute } from '@tanstack/react-router';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { rootRoute } from './root';

/**
 * SPEC §4.1c. No guard: a signed-in visitor is left alone rather than bounced
 * into the app, because the one way back from a spent reset link (§4.1d) leads
 * here and it must not depend on who the browser thinks it is.
 */
export const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  head: () => ({ meta: [{ title: 'Reset your password' }] }),
  component: ForgotPasswordScreen,
});
