import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { NotFound } from '@/features/shell/NotFound';
import { RouteError } from '@/features/shell/RouteError';
import type { SessionState } from '@/queries/use-session';

/** The session rides in router context so guards run in beforeLoad, before anything renders. */
export type RouterContext = { session: SessionState };

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});
