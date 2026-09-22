import { expect, test } from '@playwright/test';
import { apiActor, startSignedIn } from './session.js';

/**
 * Every screen has its own document title (SPEC §10.2, WCAG 2.4.2 Page Titled).
 *
 * A single static `<title>` in index.html satisfied nothing: the title is how a
 * screen-reader user learns the page changed, and how anyone with several tabs
 * open tells them apart. The case that matters most is the last one here — a
 * navigation inside the app, where the document is never reloaded and only
 * `HeadContent` updates the title.
 *
 * dev-a, read only: this reads one id and asserts titles, and writes nothing.
 */

const DEV_A = 'dev-a@example.test';
const SUFFIX = "— AJ's Hunt";

let session: string;
let applicationId: string;

test.beforeAll(async () => {
  const { client, session: stored } = await apiActor(DEV_A);
  session = stored;
  const { data, error } = await client.from('applications').select('id').limit(1);
  expect(error, 'could not read an application id').toBeNull();
  applicationId = data![0]!.id as string;
});

test('the sign-in screen names itself, before any session exists', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page).toHaveTitle(`Sign in ${SUFFIX}`);
});

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await startSignedIn(page, session);
  });

  test('each screen has its own title', async ({ page }) => {
    const screens: [string, string][] = [
      ['/applications', 'My Applications'],
      ['/applications/new', 'Add application'],
      ['/stats', 'Your Stats'],
      ['/profile', 'Profile'],
    ];

    for (const [path, name] of screens) {
      await page.goto(path);
      await expect(page).toHaveTitle(`${name} ${SUFFIX}`);
    }
  });

  test("a detail screen's title names no company (§7.3)", async ({ page }) => {
    // A title is read aloud, sits in the tab strip, and is kept in browser
    // history. Whose job it is stays inside the page.
    await page.goto(`/applications/${applicationId}`);
    await expect(page).toHaveTitle(`Application ${SUFFIX}`);

    await page.goto(`/applications/${applicationId}/edit`);
    await expect(page).toHaveTitle(`Edit application ${SUFFIX}`);
  });

  test('the title follows a navigation made inside the app, with no reload', async ({ page }) => {
    await page.goto('/applications');
    await expect(page).toHaveTitle(`My Applications ${SUFFIX}`);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stats' }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page).toHaveTitle(`Your Stats ${SUFFIX}`);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page).toHaveTitle(`My Applications ${SUFFIX}`);
  });

  test('an unknown URL falls back to the app name', async ({ page }) => {
    // Only the root route matches, so nothing below it has a title to give.
    // The screen itself says "Page not found"; the title says who we are.
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveTitle("AJ's Hunt");
  });
});
