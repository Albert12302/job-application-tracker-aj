import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiActor, startSignedIn } from './session.js';

/**
 * Deleting several applications from the list (SPEC §4.2, §9.2) end to end.
 *
 * As dev-e, which no other suite uses: each run creates and deletes several
 * applications, and dev-d's write budget is spent (CLAUDE.md). Both browser
 * projects run this at once as the same user, so each test narrows the rows
 * the page reads to its own — the deletes and reads stay real.
 */

const EMAIL = 'dev-e@example.test';

let session: string;
let client: SupabaseClient;
const made: string[] = [];

test.beforeAll(async () => {
  ({ client, session } = await apiActor(EMAIL));
});

test.afterAll(async () => {
  // Anything a failed test left behind.
  if (made.length > 0) await client.from('applications').delete().in('id', made);
});

function unique(prefix: string, testInfo: TestInfo): string {
  return `${prefix} ${testInfo.project.name} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function makeApplication(company: string, firstNote?: string): Promise<string> {
  const { data, error } = await client.rpc('create_application', {
    p_date_applied: `${new Date().toISOString().slice(0, 10)}T00:00:00+00:00`,
    p_company: company,
    p_position: 'Frontend Engineer',
    p_status: 'Applied',
    p_referral: false,
    ...(firstNote ? { p_first_note: firstNote } : {}),
  });
  expect(error).toBeNull();
  const id = (data as { id: string }).id;
  made.push(id);
  return id;
}

/** Only these applications reach the page's reads; writes pass untouched. */
async function onlyApplications(page: Page, ids: readonly string[]) {
  await page.route('**/rest/v1/applications*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const body: unknown = await response.json();
    const rows = Array.isArray(body) ? body.filter((row: { id?: string }) => ids.includes(row.id ?? '')) : body;
    await route.fulfill({ response, json: rows });
  });
}

async function expectAxeClean(page: Page) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await startSignedIn(page, session);
});

test('tick two by keyboard, confirm, and they go with their notes and history (§9.2)', async ({ page }, testInfo) => {
  const [first, second, kept] = [unique('Bulk A', testInfo), unique('Bulk B', testInfo), unique('Bulk C', testInfo)];
  const firstId = await makeApplication(first, 'Recruiter call on Monday.');
  const secondId = await makeApplication(second);
  const keptId = await makeApplication(kept);
  await onlyApplications(page, [firstId, secondId, keptId]);

  await page.goto('/applications');
  const selectFirst = page.getByRole('checkbox', { name: `Select ${first}` });
  await expect(selectFirst).toBeVisible();

  // Keyboard: the checkbox is a tab stop of its own, and Space ticks it (§10.2).
  await selectFirst.focus();
  await page.keyboard.press('Space');
  await expect(selectFirst).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/\/applications$/); // ticking never opens the row
  await page.getByRole('checkbox', { name: `Select ${second}` }).click();

  // The bar's text, and the same said to screen readers by the list's status region.
  await expect(page.locator('p:not([role])', { hasText: /^2 selected$/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^2 selected$/ })).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Select all applications' })).toHaveAttribute('aria-checked', 'mixed');
  await page.getByRole('button', { name: 'Delete 2 applications' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Delete 2 applications?' })).toBeVisible();
  // Listed newest first, as the rows are; created a moment apart, so first before second is not guaranteed.
  await expect(dialog).toContainText('This also deletes 1 note. This cannot be undone.');
  await expect(dialog).toContainText(first);
  await expect(dialog).toContainText(second);
  await expectAxeClean(page);

  await dialog.getByRole('button', { name: 'Delete 2 applications' }).click();
  await expect(page.getByText('2 applications deleted.')).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link', { name: first })).toHaveCount(0);
  await expect(page.getByRole('link', { name: second })).toHaveCount(0);
  await expect(page.getByRole('link', { name: kept })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete \d/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'My Applications' })).toBeFocused();

  // Gone from the database, with what cascades from them (§9.2).
  const { data: apps } = await client.from('applications').select('id').in('id', [firstId, secondId, keptId]);
  expect((apps ?? []).map((row) => row.id)).toEqual([keptId]);
  const { data: notes } = await client.from('notes').select('id').in('application_id', [firstId, secondId]);
  expect(notes ?? []).toEqual([]);
  const { data: history } = await client.from('status_history').select('id').in('application_id', [firstId, secondId]);
  expect(history ?? []).toEqual([]);
});

test.describe('one browser', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'app handling, not the engine; runs once');

  test('a failure part-way says where it stopped, and confirming again finishes (§8.2)', async ({ page }, testInfo) => {
    const [first, second] = [unique('Partial A', testInfo), unique('Partial B', testInfo)];
    const firstId = await makeApplication(first);
    const secondId = await makeApplication(second);
    await onlyApplications(page, [firstId, secondId]);

    // Newest first: the second one made is the first row and is deleted first. The other fails once.
    const failOnce = `**/rest/v1/applications?id=eq.${firstId}*`;
    await page.route(failOnce, (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 500, body: '{"message":"boom"}' }) : route.fallback(),
    );

    await page.goto('/applications');
    await page.getByRole('checkbox', { name: 'Select all applications' }).click();
    await page.getByRole('button', { name: 'Delete 2 applications' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByRole('button', { name: 'Delete 2 applications' }).click();

    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText(`Deleted 1 of 2 applications. Couldn't delete ${first}.`);
    await expect(alert).toContainText(/Error reference [0-9a-f]{8}/);
    await expect(page.getByText('boom')).toHaveCount(0);
    await expect(dialog.getByRole('heading', { name: `Delete your application to ${first}?` })).toBeVisible();
    await expect(page.getByRole('link', { name: second })).toHaveCount(0);

    await page.unroute(failOnce);
    await dialog.getByRole('button', { name: 'Delete 1 application' }).click();
    await expect(page.getByText('Application deleted.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  });

  test('360px: a checkbox on each card with a 44px tap area, and Select all in the bar (§11)', async ({ page }, testInfo) => {
    const company = unique('Narrow', testInfo);
    const id = await makeApplication(company);
    await onlyApplications(page, [id]);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/applications');

    const box = page.getByRole('checkbox', { name: `Select ${company}` });
    const rect = (await box.boundingBox())!;
    // A tap 20px left of the box's centre — inside a 44px target, outside the 16px box — still ticks it.
    await page.mouse.click(rect.x + rect.width / 2 - 20, rect.y + rect.height / 2);
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveURL(/\/applications$/);

    const deleteButton = page.getByRole('button', { name: 'Delete 1 application' });
    expect((await deleteButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectAxeClean(page);
  });
});
