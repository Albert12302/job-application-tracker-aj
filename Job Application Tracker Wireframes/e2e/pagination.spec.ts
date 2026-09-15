import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { apiActor, startSignedIn } from './session.js';

/**
 * Sort and pagination (SPEC §4.2, §5.3, §5.4, §10.4, §11) end to end.
 *
 * Runs as dev-g, whose 23 seeded applications are three pages of 10 and which
 * nothing writes as, so every test reads the same set and they run in parallel.
 * The expected order comes from the database itself, sorted the way §5.3 says,
 * so the pages cut in the browser are checked against it rather than against a
 * copy of the rule.
 *
 * In Pacific time: a date_applied formatted in the viewer's zone shows the day
 * before west of Greenwich, and dev-g has one on the 1st of a month (§5.4).
 */
test.use({ timezoneId: 'America/Los_Angeles', locale: 'en-US' });

type Seeded = { id: string; company: string; date_applied: string };
let newestFirst: Seeded[];
let session: string;

test.beforeAll(async () => {
  const actor = await apiActor('dev-g@example.test');
  session = actor.session;
  const { data, error } = await actor.client
    .from('applications')
    .select('id, company, date_applied')
    .order('date_applied', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });
  expect(error).toBeNull();
  newestFirst = data as Seeded[];
  expect(newestFirst, 'dev-g should have its 23 seeded applications — run npm run db:reset').toHaveLength(23);
});

test.beforeEach(async ({ page }) => {
  await startSignedIn(page, session);
});

async function expectAxeClean(page: Page) {
  await page.waitForFunction(() => document.getAnimations().length === 0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const companies = (rows: Seeded[]) => rows.map((row) => row.company);
/** The companies on screen, in order. */
const rows = (page: Page) => page.getByRole('table').getByRole('link');
const pages = (page: Page) => page.getByRole('navigation', { name: 'Pages' });
const pageLink = (page: Page, name: string) => pages(page).getByRole('link', { name, exact: true });

test('the page numbers keep one width on every page, so the controls beside them never move', async ({ page }) => {
  // 250 applications — 25 pages — made from dev-g's own rows with fresh ids; nothing is written.
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/applications') && url.searchParams.get('select') === '*',
    async (route) => {
      const response = await route.fetch();
      const seeded = (await response.json()) as Seeded[];
      await route.fulfill({
        response,
        json: Array.from({ length: 250 }, (_, i) => ({ ...seeded[i % seeded.length], id: crypto.randomUUID() })),
      });
    },
  );
  const edges = new Set<string>();
  for (const [n, numbers] of [
    [1, '1 2 3 4 5 25'],
    [5, '1 4 5 6 25'],
    [12, '1 11 12 13 25'],
    [25, '1 21 22 23 24 25'],
  ] as const) {
    await page.goto(`/applications?page=${n}`);
    await expect(pageLink(page, `Page ${n}`)).toHaveAttribute('aria-current', 'page');
    await expect(pages(page).getByRole('link', { name: /^Page \d+$/ })).toHaveText(numbers.split(' '));
    await expect(pages(page).getByRole('listitem')).toHaveCount(11); // «, ‹, seven, ›, »
    const box = (await pages(page).boundingBox())!;
    edges.add(`${Math.round(box.x)}:${Math.round(box.width)}`);
  }
  expect([...edges]).toHaveLength(1);
});

test('pages through every application newest first, none repeated or missing, with the range over all of them', async ({ page }) => {
  await page.goto('/applications');
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(0, 10)));
  await expect(page.getByText('1–10 of 23', { exact: true })).toBeVisible();
  await expect(pageLink(page, 'Page 1')).toHaveAttribute('aria-current', 'page');
  await expect(pages(page).locator('[aria-current]')).toHaveCount(1);
  await expect(pageLink(page, 'Previous')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('columnheader', { name: /Date/ })).toHaveAttribute('aria-sort', 'descending');
  await expectAxeClean(page);

  // By keyboard: Next is a link, Enter follows it, and focus lands on the new page.
  await pageLink(page, 'Next').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(10, 20)));
  await expect(page.getByText('11–20 of 23', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Your applications, newest first, page 2 of 3' })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Showing 11 to 20 of 23 applications.' })).toHaveCount(1);
  await expectAxeClean(page);

  await pageLink(page, 'Page 3').click();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(20)));
  await expect(page.getByText('21–23 of 23', { exact: true })).toBeVisible();
  await expect(pageLink(page, 'Next')).toHaveAttribute('aria-disabled', 'true');
  await expect(pageLink(page, 'Last page')).toHaveAttribute('aria-disabled', 'true');

  // First page and Last page jump to either end.
  await pageLink(page, 'First page').click();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(0, 10)));
  await expect(page).not.toHaveURL(/page=/);
  await pageLink(page, 'Last page').click();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(20)));
  await expect(page).toHaveURL(/[?&]page=3/);

  // Linkable and reloadable, and Back goes to the page before.
  await page.reload();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(20)));
  await page.goBack();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(0, 10)));
});

test('the six applications sharing a date keep one order across the end of page 1 (§5.3)', async ({ page }) => {
  const tiedDate = newestFirst[9]!.date_applied;
  expect(newestFirst[10]!.date_applied, 'the seed puts a tie across rows 10 and 11').toBe(tiedDate);

  await page.goto('/applications');
  await expect(rows(page)).toHaveCount(10);
  const first = await rows(page).allTextContents();
  await pageLink(page, 'Next').click();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(10, 20)));
  const second = await rows(page).allTextContents();
  expect([...first, ...second]).toEqual(companies(newestFirst.slice(0, 20)));
  expect(new Set([...first, ...second]).size).toBe(20);
});

test('shows a date on the 1st of the month as the 1st, in Pacific time (§5.4)', async ({ page }) => {
  const firstOfMonth = newestFirst.find((row) => row.date_applied.slice(8, 10) === '01' && row.company === 'Blue Yonder Airlines')!;
  const expected = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' }).format(
    new Date(firstOfMonth.date_applied),
  );
  expect(expected).toMatch(/\/1\//);

  await page.goto('/applications?page=3');
  const row = page.getByRole('row').filter({ has: page.getByRole('link', { name: 'Blue Yonder Airlines' }) });
  await expect(row.getByRole('cell').nth(2)).toHaveText(expected);
});

test('oldest first from the date header is newest first reversed, back on page 1', async ({ page }) => {
  await page.goto('/applications?page=2');
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(10, 20)));

  // By keyboard, so focus is on the button in every engine (Safari does not focus a clicked button).
  await page.getByRole('button', { name: 'Date, show oldest first' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/sort=date-asc/);
  await expect(page).not.toHaveURL(/page=/);
  const oldestFirst = [...newestFirst].reverse();
  await expect(rows(page)).toHaveText(companies(oldestFirst.slice(0, 10)));
  await expect(page.getByRole('columnheader', { name: /Date/ })).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.getByRole('button', { name: 'Date, show newest first' })).toBeFocused();

  await pageLink(page, 'Page 3').click();
  await expect(rows(page)).toHaveText(companies(oldestFirst.slice(20)));
});

test('rows per page, a stale page, and a filter all land on a page that exists', async ({ page }) => {
  await page.goto('/applications?page=2');
  await page.getByRole('combobox', { name: 'Rows per page' }).click();
  await page.getByRole('option', { name: '25' }).click();
  await expect(rows(page)).toHaveCount(23);
  await expect(page).toHaveURL(/pageSize=25/);
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByText('1–23 of 23', { exact: true })).toBeVisible();

  // Past the end: the last page, and the URL follows.
  await page.goto('/applications?page=9');
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(20)));
  await expect(page).toHaveURL(/[?&]page=3/);

  // A filter goes back to page 1; the tabs still count all 23, and n is the filter's.
  await page.getByRole('group', { name: 'Filter applications' }).getByRole('button', { name: 'Interview (5)' }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText('1–5 of 5', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All (23)' })).toBeVisible();
});

test('select all covers this page only, and a change of page clears it (§4.2)', async ({ page }) => {
  await page.goto('/applications');
  await page.getByRole('checkbox', { name: 'Select all applications' }).click();
  await expect(page.getByRole('button', { name: 'Delete 10 applications' })).toBeVisible();
  await pageLink(page, 'Next').click();
  await expect(rows(page)).toHaveText(companies(newestFirst.slice(10, 20)));
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
});

test('coming back from an application returns to the page it was opened from', async ({ page }) => {
  await page.goto('/applications?sort=date-asc&page=2');
  const target = [...newestFirst].reverse()[14]!;
  await page.getByRole('link', { name: target.company, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: target.company })).toBeVisible();

  await page.getByRole('link', { name: 'Back to applications' }).click();
  await expect(page).toHaveURL(/sort=date-asc/);
  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(pageLink(page, 'Page 2')).toHaveAttribute('aria-current', 'page');
});

test('Jump to bottom takes the view and focus to the pagination', async ({ page }) => {
  await page.goto('/applications?pageSize=50');
  await expect(rows(page)).toHaveCount(23);
  const jump = page.getByRole('button', { name: 'Jump to bottom' });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(page.getByRole('group', { name: 'Pagination' })).toBeFocused();
  await expect(page.getByRole('group', { name: 'Pagination' })).toBeInViewport();
  await expect(jump).toBeHidden();
});

test('a list that fails to load shows no pagination (§8.2)', async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith('/rest/v1/applications'),
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
  );
  await page.goto('/applications');
  await expect(page.getByText("Couldn't load your applications.")).toBeVisible();
  await expect(pages(page)).toHaveCount(0);
});

test.describe('at 360px (§11)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('hides numbered pages, keeps Previous, Next and the range, and sorts from its own control', async ({ page }) => {
    await page.goto('/applications');
    const cards = page.getByRole('list', { name: /^Your applications/ });
    await expect(cards.getByRole('link')).toHaveText(companies(newestFirst.slice(0, 10)));
    await expect(pages(page).getByRole('link', { name: /^Page / })).toHaveCount(0);
    await expect(page.getByText('1–10 of 23', { exact: true })).toBeVisible();
    await expect(pages(page).getByText('Page 1 of 3', { exact: true })).toBeVisible();
    // «  ‹  Page 1 of 3  ›  » on one line, even this narrow: every item centred on the same line
    // (the words are shorter than the 44px arrows, so their edges differ but not their middles).
    const middles = await pages(page).getByRole('listitem').evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return Math.round((box.top + box.bottom) / 2);
      }),
    );
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(1);

    const next = pageLink(page, 'Next');
    const sort = page.getByRole('button', { name: 'Sort by date: Newest first' });
    const ends = [pageLink(page, 'First page'), pageLink(page, 'Last page')];
    for (const control of [next, sort, page.getByRole('combobox', { name: 'Rows per page' }), ...ends]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // The page never scrolls sideways (§10.1).
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await expectAxeClean(page);

    await sort.click();
    await expect(cards.getByRole('link')).toHaveText(companies([...newestFirst].reverse().slice(0, 10)));
    await expect(page.getByRole('button', { name: 'Sort by date: Oldest first' })).toBeVisible();

    await next.click();
    await expect(page.getByRole('list', { name: 'Your applications, oldest first, page 2 of 3' })).toBeFocused();
    await expect(page.getByText('11–20 of 23', { exact: true })).toBeVisible();
    await expect(pages(page).getByText('Page 2 of 3', { exact: true })).toBeVisible();
  });
});
