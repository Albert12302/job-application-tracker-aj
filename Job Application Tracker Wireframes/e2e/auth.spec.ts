import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC §6 step 1 end to end: sign in, session, profile, photo, sign out.
 *
 * Each browser project signs in as its own seed user, so the two projects can
 * run side by side without fighting over one profile photo.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const PASSWORD = 'devpassword1234';
// src/data/client.ts AUTH_STORAGE_KEY — where the app keeps its session.
const STORAGE_KEY = 'aj-hunt-auth';

const ACCOUNTS = {
  chromium: { email: 'dev-a@example.test', name: 'Dev A', count: '7 applications tracked' },
  webkit: { email: 'dev-b@example.test', name: 'Dev B', count: '1 application tracked' },
} as const;

test.describe.configure({ mode: 'serial' });

function account(browserName: string) {
  return ACCOUNTS[browserName as keyof typeof ACCOUNTS] ?? ACCOUNTS.chromium;
}

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function expectAxeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

// 1×1 PNG, and an SVG wearing a .png name — the extension must not be trusted (§7.3).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test('signed-out visitors are sent to sign-in, and / goes to the dashboard after', async ({ page }) => {
  await page.goto('/profile');
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Fprofile/);
  await expect(page.getByText('Your session expired')).toHaveCount(0);
});

test('an empty submit shows the SPEC copy', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter an email and password.');
});

test('an unknown email gets the generic message, and the page is axe-clean', async ({ page }) => {
  await page.goto('/sign-in');
  await signIn(page, `nobody-${crypto.randomUUID()}@example.test`);
  await expect(page.getByRole('alert')).toHaveText('That email and password combination is incorrect.');
  await expect(page).toHaveURL(/\/sign-in/);
  await expectAxeClean(page);
});

test('keyboard-only sign-in lands on the dashboard; the profile shows name and count', async ({ page, browserName }) => {
  const { email, name, count } = account(browserName);
  await page.goto('/sign-in');
  // The app renders once supabase-js has restored the (absent) session; a Tab before that lands on nothing.
  await expect(page.getByLabel('Email')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole('link', { name: `Profile: ${name}` })).toBeVisible();
  await expectAxeClean(page);

  await page.getByRole('link', { name: `Profile: ${name}` }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText(count)).toBeVisible();
  await expectAxeClean(page);
});

test('photo: upload, refuse a disguised SVG, remove', async ({ page, browserName }) => {
  const { email } = account(browserName);
  await page.goto('/sign-in?redirect=%2Fprofile');
  await signIn(page, email);
  await expect(page).toHaveURL(/\/profile$/);

  const picker = page.getByLabel(/Upload a photo|Change photo/);
  // A previous aborted run may have left a photo; start from none.
  if (await page.getByRole('button', { name: 'Remove photo' }).isVisible()) {
    await page.getByRole('button', { name: 'Remove photo' }).click();
    await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  }

  await picker.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Photo updated.')).toBeVisible();
  // Axe otherwise measures the toast mid fade-in, when its text is briefly translucent.
  await expect(page.locator('[data-sonner-toast]').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('main img')).toHaveCount(1);
  await expect(page.getByLabel('Change photo')).toBeAttached();
  await expectAxeClean(page);

  await page.getByLabel('Change photo').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: SVG });
  await expect(page.getByRole('alert')).toContainText('Choose a PNG, JPEG, or WebP image.');
  await expect(page.locator('main img')).toHaveCount(1); // the old photo survives a refused one

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.getByLabel('Upload a photo')).toBeAttached();
});

test('sign out revokes the refresh token server-side (§7.1)', async ({ page, request, browserName }) => {
  const { email } = account(browserName);
  await page.goto('/sign-in');
  await signIn(page, email);
  await expect(page).toHaveURL(/\/applications$/);

  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const refreshToken = (JSON.parse(stored ?? '{}') as { refresh_token?: string }).refresh_token;
  expect(refreshToken, 'session not in storage').toBeTruthy();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/); // no redirect back, no "expired" banner
  await expect(page.getByText('Your session expired')).toHaveCount(0);

  // Not just the local copy cleared: the token no longer works anywhere.
  const refresh = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    headers: { apikey: ANON },
    data: { refresh_token: refreshToken },
  });
  expect(refresh.status()).toBeGreaterThanOrEqual(400);

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('an expired session says so, then returns to the screen after sign-in (§8.2)', async ({ page, browserName }) => {
  const { email, name } = account(browserName);
  await page.goto('/sign-in');
  // A stored session whose tokens are dead: supabase-js tries to refresh on load, fails, and drops it.
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        access_token: 'expired',
        refresh_token: 'revoked-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 1,
        user: { id: '00000000-0000-0000-0000-000000000000', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }),
    );
  }, STORAGE_KEY);

  await page.goto('/profile');
  await expect(page).toHaveURL(/\/sign-in\?.*redirect=%2Fprofile/);
  await expect(page.getByRole('status').filter({ hasText: 'Your session expired. Sign in to continue.' })).toBeVisible();

  await signIn(page, email);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
});

test('360px: no horizontal scroll, 44px controls (§11)', async ({ page, browserName }) => {
  const { email } = account(browserName);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/sign-in?redirect=%2Fprofile');

  const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noSideScroll()).toBe(true);
  for (const control of [page.getByLabel('Email'), page.getByLabel('Password'), page.getByRole('button', { name: 'Sign in' })]) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  await signIn(page, email);
  await expect(page).toHaveURL(/\/profile$/);
  expect(await noSideScroll()).toBe(true);
  expect((await page.getByRole('button', { name: 'Sign out' }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
