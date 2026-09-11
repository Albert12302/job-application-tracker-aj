import { createRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '@/features/shell/AppShell';
import { rootRoute } from './root';

/**
 * Every signed-in screen sits under this pathless route. The guard is UX, not
 * security — RLS is what keeps data private (§7.2); this only decides which
 * screen to show.
 */
export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: ({ context, location }) => {
    const { session } = context;
    if (session.status === 'signed-in') return;

    // A deliberate sign-out starts fresh; anything else comes back here afterwards.
    const deliberate = session.status === 'signed-out' && session.reason === 'signed-out';
    const expired = session.status === 'signed-out' && session.reason === 'expired';
    throw redirect({
      to: '/sign-in',
      search: deliberate ? {} : { redirect: location.href, ...(expired ? { expired: true } : {}) },
      replace: true,
    });
  },
  component: AppShell,
});
