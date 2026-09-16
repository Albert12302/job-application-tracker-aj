import { readFile } from 'node:fs/promises';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { apiActor, startSignedIn } from './session.js';

/**
 * SPEC §6 step 3 end to end: a cover letter attached from the add form,
 * downloaded, replaced, and removed on the detail screen — with the loading,
 * empty, and error states (§8.2) and the §7.3 rules checked against the real
 * Storage and upload function.
 *
 * As dev-d, whose applications no other suite counts. Each test makes and
 * names its own rows. Uploads count against dev-d's 20 an hour (§7.1): this
 * file stores three files per browser, and every error path is simulated at
 * the network rather than spent on a real upload. Refused files cost nothing.
 */

const EMAIL = 'dev-d@example.test';
const LETTERS = 'cover-letters';

test.describe.configure({ mode: 'serial' });

let session: string;
let client: SupabaseClient;
let userId: string;
const made: string[] = [];

test.beforeAll(async () => {
  ({ client, session } = await apiActor(EMAIL));
  const { data } = await client.auth.getUser();
  userId = data.user!.id;
});

test.afterAll(async () => {
  if (made.length === 0) return;
  const { data } = await client.from('applications').select('cover_letter_path').in('id', made);
  const paths = (data ?? []).map((row) => row.cover_letter_path as string | null).filter((p): p is string => !!p);
  if (paths.length > 0) await client.storage.from(LETTERS).remove(paths);
  await client.from('applications').delete().in('id', made);
});

test.beforeEach(async ({ page }) => {
  await startSignedIn(page, session);
});

function unique(prefix: string, project: string): string {
  return `${prefix} ${project} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const PDF = Buffer.from('%PDF-1.4\n% a cover letter\n');
/** The OLE2 signature: what the upload function accepts as a .doc. */
const DOC = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)]);
/** A zip signature with no Word document inside: passes the browser's quick check, refused by the function. */
const NOT_A_DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

/**
 * Once nothing is mid-animation. A toast fading in measures 1.58:1 for its
 * first frames and passes once settled, so a scan that lands on the fade
 * reports a contrast failure no one ever reads.
 */
async function expectAxeClean(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function makeApplication(company: string): Promise<string> {
  const { data, error } = await client.rpc('create_application', {
    p_date_applied: `${new Date().toISOString().slice(0, 10)}T00:00:00+00:00`,
    p_company: company,
    p_position: 'Frontend Engineer',
    p_status: 'Applied',
    p_referral: false,
  });
  expect(error).toBeNull();
  const id = (data as { id: string }).id;
  made.push(id);
  return id;
}

async function coverLetterOf(id: string) {
  const { data, error } = await client
    .from('applications')
    .select('cover_letter_path, cover_letter_name')
    .eq('id', id)
    .single();
  expect(error).toBeNull();
  return data as { cover_letter_path: string | null; cover_letter_name: string | null };
}

/** Whether the object at `path` is in Storage, asked by its name so other runs' files do not matter. */
async function stored(path: string): Promise<boolean> {
  const name = path.split('/').pop()!;
  const { data, error } = await client.storage.from(LETTERS).list(userId, { search: name });
  expect(error).toBeNull();
  return (data ?? []).some((file) => file.name === name);
}

/** Neither the page nor its HTML ever holds a signed URL (§7.3). */
async function expectNoSignedUrlInPage(page: Page) {
  const html = await page.content();
  expect(html).not.toContain('/object/sign/');
  expect(html).not.toContain('token=');
}

test('attach on add, download, replace, and remove a cover letter', async ({ page, browserName }, testInfo) => {
  const company = unique('Letterhead', testInfo.project.name);
  const firstName = 'Café cover letter (final).pdf';

  // Add, with a file chosen (§4.3)
  await page.goto('/applications/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add application' })).toBeVisible();
  await page.getByLabel('Company').fill(company);
  await page.getByLabel('Position').fill('Staff Engineer');
  await page.getByLabel('Attach cover letter').setInputFiles({ name: firstName, mimeType: 'text/html', buffer: PDF });
  await expect(page.getByText(firstName, { exact: true })).toBeVisible();
  await expect(page.getByText(`${PDF.length} bytes`)).toBeVisible();
  await expectAxeClean(page);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByText('Application added.')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: company });
  await expect(row.getByText('Attached')).toBeAttached(); // the paperclip (§4.2)

  await row.getByRole('link', { name: company }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  made.push(id);

  // What was stored: a UUID in dev-d's folder, the name only as a label (§7.3)
  const first = await coverLetterOf(id);
  expect(first.cover_letter_path).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}\\.pdf$`));
  expect(first.cover_letter_name).toBe(firstName);
  expect(await stored(first.cover_letter_path!)).toBe(true);

  await expect(page.getByText(firstName, { exact: true })).toBeVisible();
  await expect(page.getByText(`${PDF.length} bytes`)).toBeVisible();
  await expectNoSignedUrlInPage(page);
  await expectAxeClean(page);

  // The size has its own error state, and Retry (§8.2)
  await page.route('**/storage/v1/object/info/**', (route) => route.fulfill({ status: 500, body: '{"message":"boom"}' }));
  await page.reload();
  await expect(page.getByText("Couldn't load the file size.")).toBeVisible();
  await expect(page.getByText(firstName, { exact: true })).toBeVisible(); // name and actions still usable
  await page.unroute('**/storage/v1/object/info/**');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(`${PDF.length} bytes`)).toBeVisible();

  // Preview and Download: a failed URL request says so (§8.2). Preview's blank tab closes rather than sit empty.
  await page.route('**/storage/v1/object/sign/**', (route) =>
    route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{"message":"boom"}' }),
  );
  const failedTab = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Preview cover letter' }).click();
  const closedTab = await failedTab;
  await expect.poll(() => closedTab.isClosed()).toBe(true);
  const previewError = page.getByRole('alert').filter({ hasText: "Couldn't open the preview." });
  await expect(previewError).toContainText(/Error reference [0-9a-f]{8}/);

  // Download fails the same way; starting it clears the preview's failure, so one shows at a time.
  await page.getByRole('button', { name: 'Download cover letter' }).click();
  await expect(previewError).toHaveCount(0);
  const downloadError = page.getByRole('alert').filter({ hasText: "Couldn't download the cover letter." });
  await expect(downloadError).toBeVisible();
  await expect(downloadError).toContainText(/Error reference [0-9a-f]{8}/);
  await page.unroute('**/storage/v1/object/sign/**');

  // ...and the real one: a 60-second URL made on the click, the file fetched
  // through it, and saved under the original name — in WebKit too, where
  // Storage's own Content-Disposition name arrives percent-encoded
  const signing = page.waitForRequest((r) => r.url().includes('/storage/v1/object/sign/') && r.method() === 'POST');
  const fetching = page.waitForRequest((r) => r.url().includes('/storage/v1/object/sign/') && r.method() === 'GET');
  const downloading = page.waitForEvent('download');
  await downloadError.getByRole('button', { name: 'Retry' }).click();
  expect((await signing).postDataJSON()).toEqual({ expiresIn: 60 });
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(firstName);
  expect(await readFile((await download.path())!)).toEqual(PDF);

  const signedUrl = new URL((await fetching).url());
  const claims = JSON.parse(Buffer.from(signedUrl.searchParams.get('token')!.split('.')[1]!, 'base64url').toString()) as {
    iat: number;
    exp: number;
  };
  expect(claims.exp - claims.iat).toBe(60);
  // The original name never travels in the URL; the stored name is the UUID.
  expect(signedUrl.searchParams.get('download')).toBe('');
  expect(decodeURIComponent(signedUrl.href)).not.toContain('Café');
  // Opened directly, the URL is still an attachment, typed by its bytes rather than the text/html it was sent as.
  const served = await page.request.get(signedUrl.href);
  expect(served.headers()['content-disposition']).toMatch(/^attachment/);
  expect(served.headers()['content-type']).toBe('application/pdf');
  await expect(page).toHaveURL(new RegExp(`/applications/${id}$`)); // the tab stayed on the app
  await expectNoSignedUrlInPage(page);

  // Preview (§4.4): a new tab, sent to the PDF through a 60-second URL of its own, which Storage serves
  // inline on its own origin. Headless browsers have no PDF viewer, so what is checked is what the tab
  // was sent and what came back; a real one shows the file (checked by hand in Edge).
  const previewTab = page.waitForEvent('popup');
  const previewed = page
    .context()
    .waitForEvent('response', (r) => r.url().includes('/storage/v1/object/sign/') && r.request().method() === 'GET');
  await page.getByRole('button', { name: 'Preview cover letter' }).click();
  const tab = await previewTab;
  const shown = await previewed;
  const previewUrl = new URL(shown.url());
  expect(previewUrl.searchParams.has('download')).toBe(false);
  expect(decodeURIComponent(previewUrl.href)).not.toContain('Café');
  const previewClaims = JSON.parse(
    Buffer.from(previewUrl.searchParams.get('token')!.split('.')[1]!, 'base64url').toString(),
  ) as { iat: number; exp: number };
  expect(previewClaims.exp - previewClaims.iat).toBe(60);
  expect(shown.headers()['content-type']).toBe('application/pdf');
  expect(shown.headers()['content-disposition']).toBeUndefined();
  await tab.close();
  await expect(page).toHaveURL(new RegExp(`/applications/${id}$`));
  await expectNoSignedUrlInPage(page);

  // Replace (§9.4): the new file commits, then the old object goes
  const secondName = 'Letterhead v2.doc';
  await page.getByLabel('Replace cover letter').setInputFiles({ name: secondName, mimeType: 'application/pdf', buffer: DOC });
  await expect(page.getByText('Cover letter replaced.')).toBeVisible();
  await expect(page.getByText(secondName, { exact: true })).toBeVisible();
  await expect(page.getByText(firstName)).toHaveCount(0);
  // A Word file downloads only: browsers cannot show one (§4.4).
  await expect(page.getByRole('button', { name: 'Download cover letter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview cover letter' })).toHaveCount(0);

  const second = await coverLetterOf(id);
  expect(second.cover_letter_path).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}\\.doc$`));
  expect(second.cover_letter_name).toBe(secondName);
  expect(await stored(second.cover_letter_path!)).toBe(true);
  await expect.poll(() => stored(first.cover_letter_path!)).toBe(false);

  // Remove is the × on the file's own row, to the right of its name
  const remove = page.getByRole('button', { name: 'Remove cover letter' });
  const nameBox = (await page.getByText(secondName, { exact: true }).boundingBox())!;
  const removeBox = (await remove.boundingBox())!;
  expect(removeBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
  expect(removeBox.y).toBeLessThan(nameBox.y + nameBox.height); // same row, not below it
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);

  // (§9.4), by keyboard: it asks first, Escape keeps the file...
  await remove.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Remove the cover letter?');
  await expect(dialog).toContainText(`This deletes ${secondName} from this application.`);
  await expectAxeClean(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(await stored(second.cover_letter_path!)).toBe(true);

  // ...and confirming removes it, the field first, then the object
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Remove cover letter' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Cover letter removed.')).toBeVisible();
  await expect(page.getByText('No cover letter attached.')).toBeVisible();
  // Focus is not dropped to the page when the Remove button goes.
  await expect(page.getByLabel('Attach cover letter')).toBeFocused();

  expect(await coverLetterOf(id)).toEqual({ cover_letter_path: null, cover_letter_name: null });
  await expect.poll(() => stored(second.cover_letter_path!)).toBe(false);

  if (browserName === 'chromium') {
    // The list forgets the paperclip too.
    await page.goto('/applications');
    await expect(page.getByRole('row').filter({ hasText: company }).getByText('Attached')).toHaveCount(0);
  }
});

test('a failed upload on add keeps the application, and Retry on its detail screen attaches the file (§8.2, 360px)', async ({
  page,
}, testInfo) => {
  const company = unique('Retrying', testInfo.project.name);
  // Long enough to wrap: the row must reflow rather than scroll sideways (§11).
  const name = `${'A very long cover letter file name that keeps going '.repeat(4).trim()}.pdf`;
  await page.setViewportSize({ width: 360, height: 740 });

  await page.route('**/functions/v1/upload/cover-letter', (route) =>
    route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{"error":"boom"}' }),
  );

  await page.goto('/applications/new');
  await page.getByLabel('Company').fill(company);
  await page.getByLabel('Position').fill('Engineer');
  await page.getByLabel('Attach cover letter').setInputFiles({ name, mimeType: 'application/pdf', buffer: PDF });
  await page.getByRole('button', { name: 'Save' }).click();

  // Saved without the file, and on its detail screen with the failure and Retry
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  made.push(id);
  await expect(page.getByText("Application added, but the cover letter didn't upload.")).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible();
  const failure = page.getByRole('alert').filter({ hasText: 'Upload failed.' });
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(/Error reference [0-9a-f]{8}/);
  await expect(page.getByText('boom')).toHaveCount(0); // never the raw message (§8.1)
  await expect(page.getByText('No cover letter attached.')).toBeVisible();
  expect(await coverLetterOf(id)).toEqual({ cover_letter_path: null, cover_letter_name: null });

  const retry = failure.getByRole('button', { name: 'Retry' });
  expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectAxeClean(page);

  await page.unroute('**/functions/v1/upload/cover-letter');
  await retry.click();
  // Exact: "No cover letter attached." and "Uploading <name>…" contain both of these.
  await expect(page.getByText('Cover letter attached.', { exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(failure).toHaveCount(0);

  const saved = await coverLetterOf(id);
  expect(saved.cover_letter_name).toBe(name);
  expect(await stored(saved.cover_letter_path!)).toBe(true);

  // Still no sideways scroll with the long name on the row, and 44px controls (§11)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of [
    page.getByRole('button', { name: 'Preview cover letter' }),
    page.getByRole('button', { name: 'Download cover letter' }),
    page.getByText('Replace', { exact: true }),
    page.getByRole('button', { name: 'Remove cover letter' }),
  ]) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  // The × is icon-only, so its 44px must be both ways (§11).
  expect((await page.getByRole('button', { name: 'Remove cover letter' }).boundingBox())?.width).toBeGreaterThanOrEqual(44);
});

test('refused files: by the browser before upload, and by the function after (§7.3)', async ({ page }, testInfo) => {
  const company = unique('Refused', testInfo.project.name);
  const id = await makeApplication(company);
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/upload/') && request.method() === 'POST') uploads.push(request.url());
  });

  await page.goto(`/applications/${id}`);
  await expect(page.getByText('No cover letter attached.')).toBeVisible();

  // An SVG named .pdf: refused by its bytes, and never sent
  await page.getByLabel('Attach cover letter').setInputFiles({ name: 'letter.pdf', mimeType: 'application/pdf', buffer: SVG });
  await expect(page.getByRole('alert')).toHaveText('Choose a PDF, DOC, or DOCX file.');
  expect(uploads).toEqual([]);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);

  // A zip that is not a Word document: sent, refused by the function's own check, same copy
  await page.getByLabel('Attach cover letter').setInputFiles({ name: 'letter.docx', mimeType: 'application/zip', buffer: NOT_A_DOCX });
  await expect.poll(() => uploads.length).toBe(1);
  await expect(page.getByRole('alert')).toHaveText('Choose a PDF, DOC, or DOCX file.');
  await expect(page.getByText('No cover letter attached.')).toBeVisible();
  expect(await coverLetterOf(id)).toEqual({ cover_letter_path: null, cover_letter_name: null });
});
