import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { apiActor, startSignedIn } from './session.js';

/**
 * Export my data (SPEC §9.8), end to end: the button, a real read of real rows
 * through RLS, a real zip, and a real download.
 *
 * Read-only, so it runs as `dev-a` and spends none of anyone's write budget
 * (§7.1). What the zip should hold is not hardcoded — it is read back from the
 * database with the same client, so a change to the seed cannot make this fail
 * for a reason that is not about export.
 *
 * The seed stores no cover letters and no avatar, and uploading one here would
 * spend `dev-a`'s 20-an-hour (§7.1) to prove something already proved
 * precisely: `files/`, the skipped-file path, and `export-errors.txt` are
 * pinned in src/services/export-data.test.ts.
 */

type ZipEntries = Record<string, Uint8Array>;

let session: string;
let expected: { applications: { id: string; company: string }[]; filters: { name: string }[] };

test.beforeAll(async () => {
  const { client, session: stored } = await apiActor('dev-a@example.test');
  session = stored;

  const applications = await client.from('applications').select('id, company').order('id');
  const filters = await client.from('saved_filters').select('name').order('created_at');
  expect(applications.error, 'could not read dev-a — run npm run db:reset').toBeNull();
  expected = { applications: applications.data!, filters: filters.data! };
});

test.beforeEach(async ({ page }) => {
  await startSignedIn(page, session);
});

async function exportFromProfile(page: import('@playwright/test').Page) {
  await page.goto('/profile');
  const button = page.getByRole('button', { name: 'Export my data' });
  await expect(button).toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const file = await download.path();
  return {
    download,
    entries: unzipSync(new Uint8Array(readFileSync(file!))) as ZipEntries,
  };
}

const readJson = (entries: ZipEntries, name: string): unknown => JSON.parse(strFromU8(entries[name]!));

test('exports one zip of applications, saved filters and the profile (§9.8)', async ({ page }) => {
  const { download, entries } = await exportFromProfile(page);

  expect(download.suggestedFilename()).toMatch(/^job-application-tracker-\d{4}-\d{2}-\d{2}\.zip$/);
  expect(Object.keys(entries).sort()).toEqual(['applications.json', 'profile.json', 'saved-filters.json']);

  const applications = readJson(entries, 'applications.json') as {
    id: string;
    company: string;
    notes: unknown[];
    status_history: unknown[];
  }[];

  // Every application the database has for this user, and only those.
  expect([...applications].map((a) => a.id).sort()).toEqual(expected.applications.map((a) => a.id).sort());

  // Nested, not flattened — the part §9.8 says CSV would lose.
  for (const application of applications) {
    expect(Array.isArray(application.notes), `${application.company} notes`).toBe(true);
    expect(Array.isArray(application.status_history), `${application.company} history`).toBe(true);
  }
  // Created applications always have at least their creation row (§2).
  expect(applications.every((a) => a.status_history.length > 0)).toBe(true);

  expect((readJson(entries, 'saved-filters.json') as { name: string }[]).map((f) => f.name)).toEqual(
    expected.filters.map((f) => f.name),
  );
  expect(readJson(entries, 'profile.json')).toMatchObject({ name: expect.any(String) });
});

test('says what it is doing while it works, and that it is done (§10.4)', async ({ page }) => {
  await page.goto('/profile');

  // Hold the applications read open so the button can be caught mid-export.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/rest/v1/applications*', async (route) => {
    await held;
    await route.continue();
  });

  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();

  const busy = page.getByRole('button', { name: 'Preparing your data…' });
  await expect(busy).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('Preparing your data…');

  release();
  await downloaded;

  await expect(page.getByRole('status')).toHaveText('Your export is ready.');
  await expect(page.getByRole('button', { name: 'Export my data' })).toBeEnabled();
});

test('a failed read shows the error, its reference, and a Retry that works (§8.2)', async ({ page }) => {
  await page.goto('/profile');

  // Fail the first attempt only, so Retry has something to succeed at.
  let failed = false;
  await page.route('**/rest/v1/saved_filters*', async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({ status: 500, body: '{"message":"boom"}' });
  });

  await page.getByRole('button', { name: 'Export my data' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't export your data.");
  await expect(alert).toContainText(/Error reference [0-9a-f]{8}/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Retry' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});
