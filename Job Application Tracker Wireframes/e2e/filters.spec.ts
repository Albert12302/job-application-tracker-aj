import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiActor, startSignedIn } from './session.js';

/**
 * Search, filter tabs, and saved filters (SPEC §4.2, §5.1, §5.3, §8.2, §9.5)
 * end to end.
 *
 * Reading runs as dev-a, whose seeded set and two saved filters give exact
 * counts — nothing here writes as dev-a. Saving and deleting runs as dev-f,
 * which no other suite uses, in one browser and one test at a time, so no two
 * tests change its saved filters at once.
 */

async function expectAxeClean(page: Page) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const tabs = (page: Page) => page.getByRole('group', { name: 'Filter applications' });
const tab = (page: Page, name: string) => tabs(page).getByRole('button', { name, exact: true });

/** Every request to the saved_filters table, whatever its query string. */
const savedFilters = (url: URL) => url.pathname.endsWith('/rest/v1/saved_filters');

/** The companies on screen, in order. */
const rows = (page: Page) => page.getByRole('table').getByRole('link');

test.describe('as dev-a, reading', () => {
  let session: string;
  let client: SupabaseClient;

  test.beforeAll(async () => {
    ({ client, session } = await apiActor('dev-a@example.test'));
  });

  test.beforeEach(async ({ page }) => {
    await startSignedIn(page, session);
  });

  test('tabs count the whole set; a status and the search narrow the list, never the counts (§5.1, §5.3)', async ({ page }) => {
    await page.goto('/applications');
    for (const name of ['All (7)', 'Applied (2)', 'Interview (1)', 'Callback (1)', 'Offer (1)', 'Rejected (1)', 'Withdrawn (1)', 'Live (3)', 'Austin referrals (1)']) {
      await expect(tab(page, name)).toBeVisible();
    }
    await expect(tab(page, 'All (7)')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(7);

    // Location counts for the search; a description never does.
    const search = page.getByRole('searchbox', { name: 'Search' });
    await search.fill('REMOTE');
    await expect(rows(page)).toHaveText(['Wide World Importers', 'Contoso']);
    await expect(page.getByRole('status').filter({ hasText: 'Showing 2 of 7 applications.' })).toHaveCount(1);
    await search.fill('two rounds');
    await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
    await expect(page.getByText('No applications match "two rounds".')).toBeVisible();

    // On top of a status, and the counts stay whole.
    await search.fill('remote');
    await tab(page, 'Interview (1)').click();
    await expect(rows(page)).toHaveText(['Contoso']);
    await expect(tab(page, 'All (7)')).toBeVisible();
    await expect(tab(page, 'Applied (2)')).toBeVisible();
    await expect(page).toHaveURL(/filter=Interview/);
    await expect(page).toHaveURL(/q=remote/);

    // Linkable: a reload comes back to the same view.
    await page.reload();
    await expect(tab(page, 'Interview (1)')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('remote');
    await expect(rows(page)).toHaveText(['Contoso']);
    await expectAxeClean(page);
  });

  test('No matches names the filter and search, and Clear filters clears both (§8.2)', async ({ page }) => {
    await page.goto('/applications?filter=Offer&q=contoso');
    await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
    await expect(page.getByText('No applications in Offer match "contoso".')).toBeVisible();
    await expectAxeClean(page);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(rows(page)).toHaveCount(7);
    await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    await expect(page).toHaveURL(/\/applications$/);
  });

  test('a link opens on a saved filter, and changing the filter clears the selection (§4.2)', async ({ page }) => {
    const { data } = await client.from('saved_filters').select('id').eq('name', 'Live').single();
    await page.goto(`/applications?filter=${data!.id}`);
    await expect(tab(page, 'Live (3)')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveText(['Fabrikam', 'Contoso', 'Northwind Traders']);

    await page.getByRole('checkbox', { name: 'Select Contoso' }).click();
    await expect(page.locator('p:not([role])', { hasText: /^1 selected$/ })).toBeVisible();

    // By keyboard: the tabs are buttons, one tab stop each (§10.2).
    await tab(page, 'Callback (1)').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(tab(page, 'Interview (1)')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(rows(page)).toHaveText(['Contoso']);
    await expect(page.locator('p:not([role])', { hasText: /selected$/ })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Select Contoso' })).toHaveAttribute('aria-checked', 'false');
  });

  test.describe('one browser', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'layout, not the engine; runs once');

    test('360px: tabs and × are 44px targets, search above Add, the builder fits (§11)', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto('/applications');
      await expect(tab(page, 'Live (3)')).toBeVisible();

      for (const control of [tab(page, 'All (7)'), tab(page, 'Live (3)'), page.getByRole('button', { name: 'New filter' })]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const remove = (await page.getByRole('button', { name: 'Delete saved filter Live' }).boundingBox())!;
      expect(remove.width).toBeGreaterThanOrEqual(44);
      expect(remove.height).toBeGreaterThanOrEqual(44);

      const search = (await page.getByRole('searchbox', { name: 'Search' }).boundingBox())!;
      const add = (await page.getByRole('link', { name: 'Add application' }).boundingBox())!;
      expect(search.y).toBeLessThan(add.y);
      expect(search.height).toBeGreaterThanOrEqual(44);
      expect(Math.round(search.width)).toBe(Math.round(add.width));

      await page.getByRole('button', { name: 'New filter' }).click();
      const builder = page.getByRole('region', { name: 'New filter' });
      await expect(builder).toBeVisible();
      expect((await builder.locator('label', { hasText: 'Interview' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expectAxeClean(page);
    });
  });
});

test.describe('as dev-f, saving and deleting', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'app handling, not the engine; runs once');
  test.describe.configure({ mode: 'serial' });

  let session: string;
  let client: SupabaseClient;

  const clearSavedFilters = async () => {
    // dev-f's filters belong to this suite alone.
    await client.from('saved_filters').delete().eq('user_id', '66666666-6666-6666-6666-666666666666');
  };

  test.beforeAll(async () => {
    ({ client, session } = await apiActor('dev-f@example.test'));
    await clearSavedFilters();
  });

  test.afterAll(async () => {
    // afterAll still runs in the browser the block skips, where beforeAll never signed in.
    if (client) await clearSavedFilters();
  });

  test.beforeEach(async ({ page }) => {
    await startSignedIn(page, session);
  });

  test('build a filter by keyboard, save it as the active tab, then delete it back to All (§4.2, §9.5)', async ({ page }) => {
    await page.goto('/applications');
    await expect(tab(page, 'All (3)')).toBeVisible();
    await expect(page.getByText('No saved filters yet')).toBeVisible();

    const toggle = page.getByRole('button', { name: 'New filter' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    const builder = page.getByRole('region', { name: 'New filter' });
    await expect(builder.getByRole('textbox', { name: 'Name' })).toBeFocused();
    await expect(builder.getByText('Optional. Left blank, it is called Custom 1.')).toBeVisible();

    await page.keyboard.type('Portland engineers');
    await page.keyboard.press('Tab');
    await page.keyboard.type('engineer');
    await page.keyboard.press('Tab');
    // Type to narrow the places already used, then Enter picks the highlighted one.
    const location = builder.getByRole('combobox', { name: 'Location' });
    await expect(location).toBeFocused();
    await page.keyboard.type('portl');
    await expect(page.getByRole('option')).toHaveText(['Portland, OR']);
    await page.keyboard.press('Enter');
    await expect(location).toHaveValue('Portland, OR');

    // Applied, then Interview.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    // Callback, then Offer.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(builder.getByRole('checkbox', { name: 'Interview' })).toBeChecked();
    await expect(builder.getByRole('checkbox', { name: 'Offer' })).toBeChecked();
    await expectAxeClean(page);

    await builder.getByRole('button', { name: 'Save filter' }).focus();
    await page.keyboard.press('Enter');

    // Fourth Coffee (Interview) and Relecloud (Offer): Portland, with "Engineer" in the position.
    await expect(tab(page, 'Portland engineers (2)')).toHaveAttribute('aria-pressed', 'true');
    await expect(builder).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect(rows(page)).toHaveText(['Relecloud', 'Fourth Coffee']);

    const { data: saved } = await client.from('saved_filters').select('*');
    expect(saved).toEqual([
      expect.objectContaining({
        name: 'Portland engineers',
        statuses: ['Interview', 'Offer'],
        referral: 'any',
        starred: 'any',
        location: 'Portland, OR',
        text: 'engineer',
      }),
    ]);
    await expect(page).toHaveURL(new RegExp(`filter=${saved![0].id}`));

    await page.reload();
    await expect(tab(page, 'Portland engineers (2)')).toHaveAttribute('aria-pressed', 'true');

    await tabs(page).getByRole('button', { name: 'Delete saved filter Portland engineers' }).click();
    await expect(tab(page, 'All (3)')).toHaveAttribute('aria-pressed', 'true');
    await expect(tab(page, 'All (3)')).toBeFocused();
    await expect(rows(page)).toHaveCount(3);
    await expect(page).toHaveURL(/\/applications$/);
    await expect.poll(async () => (await client.from('saved_filters').select('id')).data).toEqual([]);
  });

  test('saved filters that fail to load, a failed save, and a failed delete (§8.2)', async ({ page }) => {
    const failing = (method: string) => (route: Route) =>
      route.request().method() === method ? route.fulfill({ status: 500, body: '{"message":"boom"}' }) : route.fallback();
    const failLoad = failing('GET');
    await page.route(savedFilters, failLoad);
    await page.goto('/applications');

    const alert = page.getByRole('alert').filter({ hasText: "Couldn't load your saved filters." });
    await expect(alert).toBeVisible();
    await expect(page.getByRole('button', { name: 'New filter' })).toBeDisabled();
    // The status tabs and the list carry on.
    await tab(page, 'Offer (1)').click();
    await expect(rows(page)).toHaveText(['Relecloud']);

    await page.unroute(savedFilters, failLoad);
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('No saved filters yet')).toBeVisible();

    // A failed save keeps every choice and gives a reference.
    const failSave = failing('POST');
    await page.route(savedFilters, failSave);
    await page.getByRole('button', { name: 'New filter' }).click();
    const builder = page.getByRole('region', { name: 'New filter' });
    await builder.getByRole('textbox', { name: 'Name' }).fill('Offers');
    await builder.locator('label', { hasText: 'Offer' }).click();
    await builder.getByRole('button', { name: 'Save filter' }).click();
    const saveAlert = builder.getByRole('alert');
    await expect(saveAlert).toContainText("Couldn't save the filter.");
    await expect(saveAlert).toContainText(/Error reference [0-9a-f]{8}/);
    await expect(page.getByText('boom')).toHaveCount(0);
    await expect(builder.getByRole('textbox', { name: 'Name' })).toHaveValue('Offers');
    await expect(builder.getByRole('checkbox', { name: 'Offer' })).toBeChecked();

    await page.unroute(savedFilters, failSave);
    await builder.getByRole('button', { name: 'Save filter' }).click();
    await expect(tab(page, 'Offers (1)')).toHaveAttribute('aria-pressed', 'true');

    // A failed delete puts the tab back.
    await page.route(savedFilters, failing('DELETE'));
    await tabs(page).getByRole('button', { name: 'Delete saved filter Offers' }).click();
    await expect(page.getByText("Couldn't delete the filter.")).toBeVisible();
    await expect(tab(page, 'Offers (1)')).toBeVisible();
  });
});
