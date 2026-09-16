import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FunctionComponent } from 'react';

const APP_PATHS = ['/applications', '/applications/new', '/applications/$id', '/applications/$id/edit', '/stats'] as const;

/**
 * Renders the screens under test at their real paths, inside a real router and
 * query client, starting at `path`. Every other app path renders a heading
 * naming itself, so a test can assert where a click navigated to.
 */
export function renderRoutes(screens: Partial<Record<(typeof APP_PATHS)[number], FunctionComponent>>, path: string) {
  const root = createRootRoute({ component: Outlet });
  const routes = APP_PATHS.map((routePath) =>
    createRoute({
      getParentRoute: () => root,
      path: routePath,
      component: screens[routePath] ?? (() => <h1>{`Route ${routePath}`}</h1>),
    }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient, user: userEvent.setup() };
}
