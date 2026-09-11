import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { apiSession, PASSWORD, startSignedIn } from './session.js';

/**
 * SPEC §6 step 2 end to end: add → appears in the list → detail → status →
 * edit → notes → delete (CLAUDE.md, "Playwright for the flows that cross
 * layers").
 *
 * As dev-d, whose applications no other suite counts, so this can run beside
 * auth.spec.ts. Each run makes its own company name, so the two browser
 * projects never read each other's rows.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const EMAIL = 'dev-d@example.test';

test.describe.configure({ mode: 'serial' });

// One session for the whole spec: signing in is e2e/auth.spec.ts's subject,
// not this one's, and the provider-side budget is shared (e2e/session.ts).
let session: string;

test.beforeAll(async () => {
  session = await apiSession(EMAIL);
});

test.beforeEach(async ({ page }) => {
  await startSignedIn(page, session);
});

async function openList(page: Page) {
  await page.goto('/applications');
  await expect(page.getByRole('heading', { level: 1, name: 'My Applications' })).toBeVisible();
}

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

/** The history rows an application has, oldest first — what §2 says must exist. */
async function historyFor(applicationId: string) {
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const { data } = await client
    .from('status_history')
    .select('from_status, to_status')
    .eq('application_id', applicationId)
    .order('changed_at', { ascending: true });
  return data ?? [];
}

test('add, open, restatus, edit, note, and delete an application', async ({ page }, testInfo) => {
  const company = `Northwind ${testInfo.project.name} ${Date.now()}`;
  await openList(page);
  await expectAxeClean(page);

  // Add (§4.3)
  await page.getByRole('link', { name: 'Add application' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add application' })).toBeVisible();
  await page.getByLabel('Company').fill(company);
  await page.getByLabel('Position').fill('Senior Frontend Engineer');
  await page.getByLabel('Location').fill('austin, tx');
  await page.getByLabel('Job description').fill('Design-system team.');
  await page.getByLabel('First note (optional)').fill('Applied through Sam.');
  await page.getByRole('checkbox', { name: 'Applied through a referral' }).click();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Save' }).click();

  // Back on the list, with the new application on it (§4.3)
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByText('Application added.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: company });
  await expect(row).toBeVisible();
  await expect(row.getByText('Austin, TX')).toBeVisible(); // normalized on save (§5.2)
  await expect(row.getByText('Applied')).toBeVisible();

  // The star persists (§4.2)
  await row.getByRole('button', { name: `Star ${company}` }).click();
  await expect(row.getByRole('button', { name: `Star ${company}` })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: `Star ${company}` })).toHaveAttribute('aria-pressed', 'true');

  // Detail (§4.4)
  await page.getByRole('link', { name: company }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
  const applicationId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible();
  await expect(page.getByText('Applied through Sam.')).toBeVisible();
  await expect(page.getByText('Referral')).toBeVisible();
  await expectAxeClean(page);

  // Status from the selector, which writes history with it (§9.1)
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Interview' }).click();
  await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Interview');

  // Edit, including a status change from the form (§9.1)
  await page.getByRole('link', { name: 'Edit application' }).click();
  await expect(page.getByLabel('Company')).toHaveValue(company);
  await page.getByLabel('Position').fill('Staff Frontend Engineer');
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Offer' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}$`));
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await expect(page.getByText('Staff Frontend Engineer')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Offer');

  // Both changes are recorded, from the status each started at (§2)
  expect(await historyFor(applicationId)).toEqual([
    { from_status: null, to_status: 'Applied' },
    { from_status: 'Applied', to_status: 'Interview' },
    { from_status: 'Interview', to_status: 'Offer' },
  ]);

  // Notes: add, edit, delete with Undo (§9.3). Notes made in the same minute
  // share a timestamp, so each one is reached through the text it holds.
  const notes = page.getByRole('list', { name: 'Notes' }).getByRole('listitem');
  await page.getByLabel('Add a note').fill('Panel booked for Tuesday.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(notes).toHaveCount(2);
  // Creation order, oldest first (§2) — the first note came with the application.
  await expect(notes.first()).toContainText('Applied through Sam.');
  await expect(notes.last()).toContainText('Panel booked for Tuesday.');

  const tuesday = notes.filter({ hasText: 'Panel booked for Tuesday.' });
  await tuesday.getByRole('button', { name: /^Edit note from/ }).click();
  await page.getByRole('textbox', { name: /^Edit note from/ }).fill('Panel booked for Wednesday.');
  await page.getByRole('button', { name: 'Save' }).click();

  const wednesday = notes.filter({ hasText: 'Panel booked for Wednesday.' });
  await expect(wednesday).toHaveCount(1);
  await expect(wednesday).toContainText('edited');
  // Editing does not reorder (§9.3).
  await expect(notes.first()).toContainText('Applied through Sam.');

  await wednesday.getByRole('button', { name: /^Delete note from/ }).click();
  await expect(notes).toHaveCount(1);
  await expect(page.getByText('Panel booked for Wednesday.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(notes.filter({ hasText: 'Panel booked for Wednesday.' })).toHaveCount(1);
  // Undo puts it back in its own place, not at the end (§9.3).
  await expect(notes.first()).toContainText('Applied through Sam.');

  // Delete the application (§9.2)
  await page.getByRole('button', { name: 'Delete application' }).click();
  await expect(page.getByText(`Delete your application to ${company}?`)).toBeVisible();
  await expect(page.getByText(/This also deletes 2 notes\./)).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete application' }).click();

  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByText('Application deleted.')).toBeVisible();
  await expect(page.getByRole('link', { name: company })).toHaveCount(0);
});

test('the list says when it cannot load, and Retry brings it back (§8.2)', async ({ page }) => {
  await page.route('**/rest/v1/applications*', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status: 500, body: '{"message":"boom"}' }) : route.fallback(),
  );
  await page.goto('/applications');

  const alert = page.getByRole('alert').filter({ hasText: "Couldn't load your applications." });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/Error reference [0-9a-f]{8}/);
  await expect(page.getByText('boom')).toHaveCount(0); // never the raw message (§8.1)

  await page.unroute('**/rest/v1/applications*');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('table')).toBeVisible();
});

test('360px: cards instead of a table, no sideways scroll, 44px controls (§11)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openList(page);

  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Your applications, newest first' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const add = page.getByRole('link', { name: 'Add application' }).first();
  expect((await add.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const star = page.getByRole('button', { name: /^Star / }).first();
  const starBox = await star.boundingBox();
  expect(starBox?.height).toBeGreaterThanOrEqual(44);
  expect(starBox?.width).toBeGreaterThanOrEqual(44);
});

test('keyboard alone: reach a row, star it, and open it', async ({ page, browserName }) => {
  await openList(page);

  const row = page.getByRole('row').nth(1); // nth(0) is the header
  const star = row.getByRole('button', { name: /^Star / });
  const link = row.getByRole('link');

  const pressed = await star.getAttribute('aria-pressed');
  await star.focus();
  await expect(star).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(star).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');

  if (browserName === 'chromium') {
    // The company link is the next stop — the row itself is not a tab stop.
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
  } else {
    // WebKit tabs to links only when Safari's "Tab highlights each item" is
    // on, which it is not by default. That is a platform setting, not this
    // page: what matters here is that the link takes the keyboard and opens.
    await link.focus();
  }

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('link', { name: 'Back to applications' })).toBeVisible();

  // The detail screen's own controls, by keyboard: the status selector opens,
  // takes a value, and saves; the delete dialog traps Escape rather than
  // deleting anything (§10.2).
  const status = page.getByRole('combobox', { name: 'Status' });
  const before = (await status.textContent())?.trim();
  await status.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(status).not.toHaveText(before ?? '');

  await page.getByRole('button', { name: 'Delete application' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
});
