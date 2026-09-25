import { HeadContent, Outlet } from '@tanstack/react-router';
import { OfflineBanner } from './OfflineBanner';

/**
 * What the root route renders: the document head, the offline banner, then the
 * matched route.
 *
 * `HeadContent` writes the title each route declares in its `head`
 * (routes/title.ts), which is what makes the title change with the page
 * (SPEC §10.2). It lives here rather than in `routes/root.tsx` because a route
 * file composes features and exports no components of its own.
 *
 * The banner is here rather than in AppShell so that it covers the signed-out
 * screens too, and so it survives a route error or a 404 — the states where
 * knowing the network is down explains the most (§8.2).
 */
export function RootLayout() {
  return (
    <>
      <HeadContent />
      <OfflineBanner />
      <Outlet />
    </>
  );
}
