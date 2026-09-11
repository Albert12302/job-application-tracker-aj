import { createRoute, redirect } from '@tanstack/react-router';
import { safeRedirect } from '@/domain/redirect';
import { signInSearchSchema } from '@/domain/schemas';
import { SignInScreen } from '@/features/auth/SignInScreen';
import { rootRoute } from './root';

export const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: signInSearchSchema,
  // Signing in changes the session, which re-runs this guard (main.tsx) and
  // sends the user on — to where they were if the session expired (§8.2),
  // otherwise straight to the dashboard (§4.1).
  beforeLoad: ({ context, search }) => {
    if (context.session.status === 'signed-in') {
      throw redirect({ href: safeRedirect(search.redirect), replace: true });
    }
  },
  component: SignInScreen,
});
