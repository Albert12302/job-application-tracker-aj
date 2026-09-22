import { HeadContent, Outlet } from '@tanstack/react-router';

/**
 * What the root route renders: the document head, then the matched route.
 *
 * `HeadContent` writes the title each route declares in its `head`
 * (routes/title.ts), which is what makes the title change with the page
 * (SPEC §10.2). It lives here rather than in `routes/root.tsx` because a route
 * file composes features and exports no components of its own.
 */
export function RootLayout() {
  return (
    <>
      <HeadContent />
      <Outlet />
    </>
  );
}
