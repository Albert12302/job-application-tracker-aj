import { createRoute } from '@tanstack/react-router';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { rootRoute } from './root';

/**
 * SPEC §4.1d, the address the emailed link lands on.
 *
 * No `validateSearch` and no guard, deliberately: the link's tokens arrive in
 * the URL *fragment*, which is not search state and is never anything this app
 * keeps — data/auth.ts takes them out of the address bar as the module loads.
 * A guard would be worse than useless here, since the app holds no session at
 * this point and the one the link carries is never adopted.
 */
export const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  head: () => ({ meta: [{ title: 'Set a new password' }] }),
  component: ResetPasswordScreen,
});
