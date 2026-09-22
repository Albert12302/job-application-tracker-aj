import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { expectAxeClean } from './a11y.js';
import { apiActor, startSignedIn } from './session.js';

/**
 * The display name end to end (SPEC §4.6): a real write, and both places the
 * name is shown reading the same query.
 *
 * As dev-h, which exists for this suite alone (supabase/seed.sql). No other
 * seed user can serve: e2e/auth.spec.ts asserts dev-a's and dev-b's names
 * exactly, and a full run has already spent nearly all of dev-d's 120 writes a
 * minute (§7.1). These tests spend four of dev-h's, the restore included.
 *
 * Serial, because each one leaves the name where the next starts from, and the
 * last puts it back so a second run without `db reset` behaves the same.
 */

const DEV_H = 'dev-h@example.test';
/** dev-h's fixed seed id, so the restore needs no round trip to ask. */
const DEV_H_ID = '88888888-8888-8888-8888-888888888888';
/** What seed.sql sets, restored in afterAll. */
const SEEDED = 'Dev H';
/** `displayName()` on dev-h@example.test: the local part up to the first separator. */
const DERIVED = 'Dev';

test.describe.configure({ mode: 'serial' });
// One browser: this is the app's own logic, not an engine difference, and every
// extra project would spend dev-h's writes again.
test.skip(({ browserName }) => browserName !== 'chromium', 'one browser is enough for a write path');

let session: string;
let client: SupabaseClient | null = null;

// The skip above still runs the hooks, and signing in spends the one
// provider-side bucket every sign-in shares (§7.1) — so the other projects
// must not sign in for tests they will not run.
test.beforeAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  const actor = await apiActor(DEV_H);
  session = actor.session;
  client = actor.client;
});

test.beforeEach(async ({ page }) => {
  await startSignedIn(page, session);
});

test.afterAll(async () => {
  if (!client) return;
  const { error } = await client.from('profiles').update({ name: SEEDED }).eq('id', DEV_H_ID);
  expect(error, "could not put dev-h's name back").toBeNull();
});

test('a new name reaches the heading, the header, and the next page load', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: SEEDED })).toBeVisible();

  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await expectAxeClean(page); // the field, its label and its buttons (§10.5)
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Name updated.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible();
  // The header reads the same query, so one invalidation has to serve both. By
  // the link's accessible name, which carries an sr-only "Profile: " prefix.
  await expect(page.getByRole('banner').getByRole('link', { name: /Ada Lovelace/ })).toBeVisible();
  // The field closes, so the heading is the only name on screen.
  await expect(page.getByLabel('Your name')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible();
});

test('emptying the field clears the name, which falls back to the email', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByLabel('Your name').fill('');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Name removed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: DERIVED })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: DERIVED })).toBeVisible();
});

test('Cancel leaves the stored name alone', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByLabel('Your name').fill('Not saved');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page.getByRole('heading', { level: 1, name: DERIVED })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: DERIVED })).toBeVisible();
});

test('the field is operable from the keyboard alone, and focus comes back (§10.3)', async ({ page }) => {
  await page.goto('/profile');
  const edit = page.getByRole('button', { name: 'Edit name' });

  // WebKit does not focus a button on click, so the keyboard path presses it
  // from the keyboard — and this test is about that path anyway (CLAUDE.md).
  await edit.focus();
  await page.keyboard.press('Enter');

  const field = page.getByLabel('Your name');
  await expect(field).toBeFocused();
  await field.fill('Grace Hopper');
  await page.keyboard.press('Enter'); // submits, as a single-field form should

  await expect(page.getByRole('heading', { level: 1, name: 'Grace Hopper' })).toBeVisible();
  await expect(edit).toBeFocused();
});

test('a name past 120 characters is refused with the copy, and nothing is stored', async ({ page }) => {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByLabel('Your name').fill('x'.repeat(121));
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('alert')).toContainText('Keep this under 120 characters.');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Grace Hopper' })).toBeVisible();
});

test('the control is 44px on a phone (§11)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/profile');

  const edit = page.getByRole('button', { name: 'Edit name' });
  expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await edit.click();
  // Measured, not read off the class list: an attribute selector in a generated
  // primitive outranks a caller's plain height (CLAUDE.md).
  expect((await page.getByLabel('Your name').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByRole('button', { name: 'Save' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByRole('button', { name: 'Cancel' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
