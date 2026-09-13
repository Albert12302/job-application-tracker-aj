import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiActor, apiSession, startSignedIn } from './session.js';

/**
 * SPEC §6 step 4 end to end: stats read from status_history (§4.5), their
 * three states (§8.2), and the phone layout (§11).
 *
 * Two users, for two reasons:
 * - dev-a, read only. Its seeded applications never change during a run
 *   (e2e/auth.spec.ts counts them), so its numbers can be asserted exactly.
 *   Tailspin Toys went Interview → Rejected in the seed: 4 Interviewed here,
 *   where current status alone would say 3.
 * - dev-d, for the test that changes statuses (CLAUDE.md). Other suites add and
 *   delete dev-d's applications at the same time, so that test narrows the
 *   responses the page reads to its own application — the writes, the reads,
 *   and the counting are all real; only other tests' rows are left out.
 */

const DEV_A = 'dev-a@example.test';
const DEV_D = 'dev-d@example.test';

async function expectAxeClean(page: Page) {
  // A skeleton still pulsing, or a toast mid-fade, measures low and fails at random (CLAUDE.md).
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

/** A stat card, found by its label. */
function card(page: Page, label: string) {
  return page.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) });
}

async function expectCard(page: Page, label: string, count: string, percent: string) {
  const stat = card(page, label);
  await expect(stat.locator('dd').first()).toHaveText(count);
  await expect(stat.locator('dd').nth(1)).toHaveText(`${percent} of applications`);
}

test.describe("dev-a's seeded applications", () => {
  let session: string;

  test.beforeAll(async () => {
    session = await apiSession(DEV_A);
  });

  test.beforeEach(async ({ page }) => {
    await startSignedIn(page, session);
  });

  test('reached from the nav by keyboard; counts how far each application got', async ({ page, browserName }) => {
    await page.goto('/applications');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const statsLink = nav.getByRole('link', { name: 'Stats' });
    await expect(statsLink).toBeVisible();

    if (browserName === 'chromium') {
      // Skip link, brand, Home, then Stats.
      await nav.getByRole('link', { name: 'Home' }).focus();
      await page.keyboard.press('Tab');
    } else {
      // WebKit tabs to links only with Safari's "Tab highlights each item" on
      // (see applications.spec.ts); what matters is that the link takes Enter.
      await statsLink.focus();
    }
    await expect(statsLink).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/stats$/);
    await expect(statsLink).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1, name: 'Your Stats' })).toBeVisible();
    await expect(page.getByText(/^\d[\d,]* applications?$/)).toHaveText('7 applications');

    await expectCard(page, 'Interviewed', '4', '57%');
    await expectCard(page, 'Callbacks', '2', '29%');
    await expectCard(page, 'Offers', '1', '14%');
    await expectCard(page, 'Heard back', '4', '57%');

    // By current status, in §3 order, each named in text (§10.1).
    await expect(page.getByRole('list', { name: 'Status breakdown' }).getByRole('listitem')).toHaveText([
      'Applied · 2',
      'Interview · 1',
      'Callback · 1',
      'Offer · 1',
      'Rejected · 1',
      'Withdrawn · 1',
    ]);
    await expectAxeClean(page);
  });

  test('says when stats cannot load, keeps the nav usable, and Retry brings them back (§8.2)', async ({ page }) => {
    await page.route('**/rest/v1/status_history*', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{"message":"boom"}' }) : route.fallback(),
    );
    await page.goto('/stats');

    const alert = page.getByRole('alert').filter({ hasText: "Couldn't load stats." });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/Error reference [0-9a-f]{8}/);
    await expect(page.getByText('boom')).toHaveCount(0); // never the raw message (§8.1)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' })).toBeVisible();
    await expectAxeClean(page);

    await page.unroute('**/rest/v1/status_history*');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expectCard(page, 'Interviewed', '4', '57%');
  });

  test('zero applications is the empty state, never a divide by zero (§8.2)', async ({ page }) => {
    for (const table of ['applications', 'status_history']) {
      await page.route(`**/rest/v1/${table}*`, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          : route.fallback(),
      );
    }
    await page.goto('/stats');

    await expect(page.getByRole('heading', { name: 'Nothing to chart yet' })).toBeVisible();
    await expect(page.getByText('Add your first application to see stats.')).toBeVisible();
    await expect(page.locator('dl')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/NaN|Infinity/);
    await expectAxeClean(page);
  });

  test('360px: two cards to a row, no sideways scroll, 44px nav targets (§11)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/stats');
    await expectCard(page, 'Interviewed', '4', '57%');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const boxes = await Promise.all(
      ['Interviewed', 'Callbacks', 'Offers', 'Heard back'].map(async (label) => (await card(page, label).boundingBox())!),
    );
    const [first, second, third, fourth] = boxes;
    expect(second!.y).toBe(first!.y);
    expect(third!.y).toBeGreaterThan(first!.y + first!.height - 1);
    expect(fourth!.y).toBe(third!.y);

    const statsLink = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stats' });
    expect((await statsLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("dev-d's status changes", () => {
  test.describe.configure({ mode: 'serial' });
  // One browser: this checks the cache and the history read, not the engine — the
  // screen itself runs in both above — and dev-d's write budget is nearly spent (CLAUDE.md).
  test.skip(({ browserName }) => browserName !== 'chromium', "dev-d's writes; runs once");

  let session: string;
  let client: SupabaseClient;
  const made: string[] = [];

  test.beforeAll(async () => {
    ({ client, session } = await apiActor(DEV_D));
  });

  test.afterAll(async () => {
    if (made.length > 0) await client.from('applications').delete().in('id', made);
  });

  /**
   * Only `id`'s rows reach the page from the two tables stats read (and the
   * list and detail, which read one of them). Everything else about the
   * requests is untouched.
   */
  async function onlyApplication(page: Page, id: string) {
    for (const [table, key] of [
      ['applications', 'id'],
      ['status_history', 'application_id'],
    ] as const) {
      await page.route(`**/rest/v1/${table}*`, async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const response = await route.fetch();
        const body: unknown = await response.json();
        const rows = Array.isArray(body) ? body.filter((row: Record<string, unknown>) => row[key] === id) : body;
        await route.fulfill({ response, json: rows });
      });
    }
  }

  async function pickStatus(page: Page, status: string) {
    const select = page.getByRole('combobox', { name: 'Status' });
    await select.click();
    await page.getByRole('option', { name: status, exact: true }).click();
    await expect(select).toContainText(status);
  }

  /**
   * Five of dev-d's writes — create (the application and its history row), one
   * change (the status and its row), and the cleanup delete. dev-d's 120-a-minute
   * write limit (§7.1) is shared with every other suite that writes as dev-d at
   * the same moment, so each change here is spent carefully. The correction
   * rule's cases are domain/stats.test.ts's.
   */
  test('a status change reaches stats at once, and Interview → Rejected stays Interviewed', async ({ page }, testInfo) => {
    const company = `Stats ${testInfo.project.name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await client.rpc('create_application', {
      p_date_applied: `${new Date().toISOString().slice(0, 10)}T00:00:00+00:00`,
      p_company: company,
      p_position: 'Frontend Engineer',
      p_status: 'Interview',
      p_referral: false,
    });
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    made.push(id);

    await startSignedIn(page, session);
    await onlyApplication(page, id);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const legend = page.getByRole('list', { name: 'Status breakdown' }).getByRole('listitem');

    // Load stats first, so what follows has to replace a cached answer (§4.4 "live").
    await page.goto('/stats');
    await expectCard(page, 'Interviewed', '1', '100%');
    await expect(legend).toHaveText(['Interview · 1']);

    // Through the app, without a reload: the list, the detail, the selector.
    await nav.getByRole('link', { name: 'Home' }).click();
    await page.getByRole('link', { name: company }).click();
    await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible();
    await pickStatus(page, 'Rejected');

    await nav.getByRole('link', { name: 'Stats' }).click();
    // The breakdown follows the new status: stats were refetched, not served from cache.
    await expect(legend).toHaveText(['Rejected · 1']);
    // And the history was read: by current status alone this would be 0 (§4.5).
    await expectCard(page, 'Interviewed', '1', '100%');
    await expectCard(page, 'Callbacks', '0', '0%');
    await expectCard(page, 'Offers', '0', '0%');
    await expectCard(page, 'Heard back', '1', '100%');

    // Stats only read: the history is exactly the change made, one row each (§2).
    const { data: history } = await client
      .from('status_history')
      .select('from_status, to_status')
      .eq('application_id', id)
      .order('changed_at', { ascending: true });
    expect(history).toEqual([
      { from_status: null, to_status: 'Interview' },
      { from_status: 'Interview', to_status: 'Rejected' },
    ]);
  });
});
