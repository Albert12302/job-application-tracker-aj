import { createRootRouteWithContext } from '@tanstack/react-router';
import { NotFound } from '@/features/shell/NotFound';
import { RootLayout } from '@/features/shell/RootLayout';
import { RouteError } from '@/features/shell/RouteError';
import type { SessionState } from '@/queries/use-session';
import { APP_NAME } from '@/lib/app-name';

/** The session rides in router context so guards run in beforeLoad, before anything renders. */
export type RouterContext = { session: SessionState };

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  // The fallback title: an unmatched URL renders notFoundComponent with only
  // this route matched, so nothing else has a title to give.
  head: () => ({ meta: [{ title: APP_NAME }] }),
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});
