import { expect, test, type Page } from '@playwright/test';

/**
 * §7.9 item 2: the error path triggered on purpose, not assumed. The network
 * is failed at the edge of the browser, so everything above it — data layer,
 * reporting, the screens — runs for real.
 */

const PASSWORD = 'devpassword1234';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// One browser: these test the app's handling, not the engine, and every run is a sign-in.
test.skip(({ browserName }) => browserName !== 'chromium', 'error paths; one browser is enough');
test.describe.configure({ mode: 'serial' });

async function signInToProfile(page: Page) {
  await page.goto('/sign-in?redirect=%2Fprofile');
  await page.getByLabel('Email').fill('dev-a@example.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/profile$/);
}

test('profile load failure: plain message, reference, Retry — and sign out still works', async ({ page }) => {
  await page.route('**/rest/v1/profiles*', (route) => route.fulfill({ status: 500, body: '{"message":"boom"}' }));
  await signInToProfile(page);

  const alert = page.getByRole('alert').filter({ hasText: "Couldn't load your profile." });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/Error reference [0-9a-f]{8}/);
  await expect(page.getByText('boom')).toHaveCount(0); // never the raw server message (§8.1)
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeEnabled();

  await page.unroute('**/rest/v1/profiles*');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dev A' })).toBeVisible();
});

test('name save failure: plain message, reference, and the field keeps what was typed', async ({ page }) => {
  await signInToProfile(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Dev A' })).toBeVisible();

  // Failed at the network, so nothing is written and dev-a's seeded name — which
  // e2e/auth.spec.ts asserts — is never touched (CLAUDE.md).
  await page.route('**/rest/v1/profiles?*', (route) =>
    route.request().method() === 'PATCH' ? route.fulfill({ status: 500, body: '{"message":"boom"}' }) : route.fallback(),
  );

  await page.getByRole('button', { name: 'Edit name' }).click();
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByRole('button', { name: 'Save' }).click();

  const alert = page.getByRole('alert').filter({ hasText: "Couldn't save your name." });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/Error reference [0-9a-f]{8}/);
  await expect(page.getByText('boom')).toHaveCount(0); // never the raw server message (§8.1)
  // The field stays open holding the edit, so Save is a retry with nothing retyped.
  await expect(page.getByLabel('Your name')).toHaveValue('Ada Lovelace');
  await expect(page.getByRole('heading', { level: 1, name: 'Dev A' })).toBeVisible();

  await page.unroute('**/rest/v1/profiles?*');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Dev A' })).toBeVisible();
});

test('upload failure: "Upload failed." + Retry, no photo half-set, Retry succeeds', async ({ page }) => {
  await signInToProfile(page);
  if (await page.getByRole('button', { name: 'Remove photo' }).isVisible()) {
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  }

  await page.route('**/functions/v1/upload/avatar', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}' }) : route.fallback(),
  );
  await page.getByLabel('Upload a photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });

  await expect(page.getByRole('alert')).toContainText('Upload failed.');
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);

  await page.unroute('**/functions/v1/upload/avatar');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Photo updated.')).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(1);

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
});
