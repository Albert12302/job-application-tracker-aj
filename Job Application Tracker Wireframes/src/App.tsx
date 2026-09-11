import { createRouter } from '@tanstack/react-router';
import { applicationsRoute } from './routes/applications';
import { authenticatedRoute } from './routes/authenticated';
import { indexRoute } from './routes/index';
import { profileRoute } from './routes/profile';
import { rootRoute } from './routes/root';
import { signInRoute } from './routes/sign-in';

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  authenticatedRoute.addChildren([applicationsRoute, profileRoute]),
]);

export const router = createRouter({
  routeTree,
  // Replaced on first render by the real session (main.tsx).
  context: { session: { status: 'loading' } },
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
