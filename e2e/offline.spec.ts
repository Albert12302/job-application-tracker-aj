import { expect, test } from '@playwright/test';
import { expectAxeClean, settled } from './a11y.js';
import { apiSession, startSignedIn } from './session.js';

/**
 * The offline banner and what a change does with no network (SPEC §8.2).
 *
 * The write half is the point: TanStack Query's default would pause a mutation
 * with no network and replay it on reconnect, so the banner would promise a
 * change had not saved while it was in fact queued to save later. Here it fails
 * while the network is gone and stays failed after it returns.
 *
 * Runs as `dev-f`, and spends none of its write budget (§7.1): `setOffline`
 * blocks the request in the browser, so the one change it attempts never leaves.
 * `dev-f` rather than `dev-d`, whose budget a full run nearly spends, and whose
 * seed holds no applications to act on; `auth.spec.ts` asserts `dev-a`'s and
 * `dev-g`'s sets, not this one's. Nothing here touches its saved filters, which
 * `filters.spec.ts` owns.
 *
 * The network is restored in an `afterEach` rather than at the end of each
 * test, so a failure part way through cannot leave the context offline for the
 * next one. The session is taken per test rather than in a `beforeEach`,
 * because one of these has to start signed out.
 */

const BANNER = "You're offline. Changes won't save.";

let session: string;
test.beforeAll(async () => {
  session = await apiSession('dev-f@example.test');
});

test.afterEach(async ({ context }) => {
  await context.setOffline(false);
});

test('the banner comes and goes with the network', async ({ page, context }) => {
  await startSignedIn(page, session);
  await page.goto('/applications');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText(BANNER, { exact: true })).toBeHidden();

  await context.setOffline(true);
  await expect(page.getByText(BANNER, { exact: true })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(BANNER, { exact: true })).toBeHidden();
});

test('the banner is announced, and the screen scans clean', async ({ page, context }) => {
  await startSignedIn(page, session);
  await page.goto('/applications');
  await expect(page.getByRole('table')).toBeVisible();

  await context.setOffline(true);
  // A live region carries it, so a screen reader hears the network go (§10.4).
  await expect(page.getByRole('status').filter({ hasText: BANNER })).toBeVisible();

  await expectAxeClean(page);
});

// No stored session, so the guard leaves this one on /sign-in.
test('it shows on a signed-out screen too', async ({ page, context }) => {
  // Loaded first: with no network there is no app to render the banner.
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText(BANNER, { exact: true })).toBeVisible();
});

// One browser: what is under test is the query client's network mode, not an
// engine's rendering, and the banner's own tests above cover WebKit (§12).
test('a change offline fails, and does not replay on reconnect', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chromium', 'the network mode is the subject, not the engine');

  await startSignedIn(page, session);
  await page.goto('/applications');
  const star = page.getByRole('button', { name: /^Star / }).first();
  await expect(star).toBeVisible();
  const before = (await star.getAttribute('aria-pressed')) ?? 'false';

  await context.setOffline(true);
  await star.click();

  // The toast names the connection and carries no error reference: an offline
  // failure is the user's to resolve, so nothing was reported (§7.7, §8.2).
  await expect(page.getByText('Check your connection and try again.')).toBeVisible();
  await expect(page.getByText('Error reference')).toBeHidden();

  // The optimistic star rolls back rather than sitting on a value the database
  // does not have (§8.3).
  await settled(page);
  await expect(star).toHaveAttribute('aria-pressed', before);

  // The rows survive the failure: the star's onError invalidates the list, and
  // what that invalidation does with no network must not cost the user the
  // table they were reading (§8.2). Not a guard on the query client's
  // networkMode — measured, the list keeps its rows under either setting.
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText("Couldn't load your applications.")).toBeHidden();

  // Back online, the write is gone rather than queued behind the banner.
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Star / }).first()).toHaveAttribute('aria-pressed', before);
});
