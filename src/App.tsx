import { createRouter } from '@tanstack/react-router';
import { applicationDetailRoute } from './routes/application-detail';
import { applicationEditRoute } from './routes/application-edit';
import { applicationNewRoute } from './routes/application-new';
import { applicationsRoute } from './routes/applications';
import { authenticatedRoute } from './routes/authenticated';
import { forgotPasswordRoute } from './routes/forgot-password';
import { indexRoute } from './routes/index';
import { profileRoute } from './routes/profile';
import { resetPasswordRoute } from './routes/reset-password';
import { rootRoute } from './routes/root';
import { signInRoute } from './routes/sign-in';
import { statsRoute } from './routes/stats';

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  authenticatedRoute.addChildren([
    applicationsRoute,
    applicationNewRoute,
    applicationDetailRoute,
    applicationEditRoute,
    statsRoute,
    profileRoute,
  ]),
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
