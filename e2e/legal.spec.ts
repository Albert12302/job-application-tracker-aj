import { expect, test } from '@playwright/test';
import { expectAxeClean, settled } from './a11y.js';
import { apiSession, startSignedIn } from './session.js';

/**
 * SPEC §4.7: the privacy policy and terms are public pages, linked from a
 * footer on every screen, signed in or out.
 *
 * dev-a, read only: this opens the list and follows a link, and writes nothing.
 */

test('both pages are readable signed out, from the sign-in screen', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle('Privacy policy');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expectAxeClean(page);

  await page.getByRole('link', { name: 'Terms of use' }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page).toHaveTitle('Terms of use');
  await expectAxeClean(page);

  // No guard on either page, and Back sends a visitor with no session to sign-in.
  await page.getByRole('link', { name: "Back to AJ's Hunt" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test('a short signed-in screen holds the footer at the bottom of the window', async ({ page }) => {
  // Taller than the projects' 720: at 720 the seven rows and the footer only
  // just overflow it, and the footer rightly follows the content instead.
  await page.setViewportSize({ width: 1280, height: 1000 });
  await startSignedIn(page, await apiSession('dev-a@example.test'));
  await page.goto('/applications');
  const footer = page.getByRole('contentinfo');
  // The loaded list, not its skeleton, whose placeholder rows are taller than
  // dev-a's seven: measured under the skeleton, the footer is below the window.
  await expect(page.getByText('1–7 of 7', { exact: true })).toBeVisible();
  await settled(page);
  // dev-a's seven rows leave the list shorter than the window, so the footer's
  // bottom edge should meet the window's rather than sit under the table.
  const box = await footer.boundingBox();
  const height = page.viewportSize()!.height;
  expect(Math.round(box!.y + box!.height)).toBe(height);

  await footer.getByRole('link', { name: 'Terms' }).click();
  await expect(page).toHaveTitle('Terms of use');

  await page.getByRole('link', { name: "Back to AJ's Hunt" }).click();
  await expect(page).toHaveURL(/\/applications/);
});

test('the not-found page carries the footer too', async ({ page }) => {
  // It renders outside AppShell, so it has a footer of its own to forget.
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveTitle('Privacy policy');
});
