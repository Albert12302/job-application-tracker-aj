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
 * The titles are the page name alone, with no app-name suffix: a tab truncates
 * from the right, so a suffix on every screen eats the room the distinguishing
 * part needs. `toHaveTitle` takes the whole title, so these assertions would
 * fail if one crept back in.
 *
 * dev-a, read only: this reads one id and asserts titles, and writes nothing.
 */

const DEV_A = 'dev-a@example.test';
/** Only where no page can give a title: an address that matches nothing. */
const APP_NAME = "AJ's Hunt";

let session: string;
/** Two of dev-a's, so a move between them can be asserted. Read only. */
let rows: { id: string; company: string }[];

test.beforeAll(async () => {
  const { client, session: stored } = await apiActor(DEV_A);
  session = stored;
  // Taken from the database, never written into the test: the titles have to
  // match the rows the screen loads, whatever the seed says.
  const { data, error } = await client.from('applications').select('id, company').order('company').limit(2);
  expect(error, 'could not read dev-a’s applications').toBeNull();
  rows = data as typeof rows;
  expect(rows[0]!.company, 'need two companies with different names').not.toBe(rows[1]!.company);
});

test('the sign-in screen names itself, before any session exists', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page).toHaveTitle('Sign in');
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
      await expect(page).toHaveTitle(name);
    }
  });

  test("a detail screen's title names its company", async ({ page }) => {
    // The one screen whose title has to tell one instance from another: with
    // several tabs open, "Application" on all of them says nothing.
    const [first] = rows;
    await page.goto(`/applications/${first!.id}`);
    await expect(page).toHaveTitle(`${first!.company} Application`);

    // The edit screen stays plain: one title per screen is enough, and it is
    // reached from a detail screen that already said which application it is.
    await page.goto(`/applications/${first!.id}/edit`);
    await expect(page).toHaveTitle('Edit application');
  });

  test('a detail screen that loads nothing keeps the plain title', async ({ page }) => {
    // No row, so no company: the route's own head has to stand rather than the
    // title being built from data that is not there.
    await page.goto('/applications/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('heading', { level: 1, name: 'Application not found' })).toBeVisible();
    await expect(page).toHaveTitle('Application');
  });

  test('the title moves from one application to another', async ({ page }) => {
    // Both are the same route, so `head` never changes and HeadContent does not
    // rewrite: only the loaded company can move this title, which is the whole
    // reason the screen sets it rather than the route.
    const [first, second] = rows;
    await page.goto(`/applications/${first!.id}`);
    await expect(page).toHaveTitle(`${first!.company} Application`);

    await page.goto(`/applications/${second!.id}`);
    await expect(page).toHaveTitle(`${second!.company} Application`);

    // And leaving restores a route's own title.
    await page.getByRole('link', { name: 'Back to applications' }).click();
    await expect(page).toHaveURL(/\/applications(\?|$)/);
    await expect(page).toHaveTitle('My Applications');
  });

  test('the title follows a navigation made inside the app, with no reload', async ({ page }) => {
    await page.goto('/applications');
    await expect(page).toHaveTitle('My Applications');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Stats' }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page).toHaveTitle('Your Stats');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/applications$/);
    await expect(page).toHaveTitle('My Applications');
  });

  test('an unknown URL falls back to the app name', async ({ page }) => {
    // Only the root route matches, so nothing below it has a title to give.
    // The screen itself says "Page not found"; the title says who we are.
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveTitle(APP_NAME);
  });
});
