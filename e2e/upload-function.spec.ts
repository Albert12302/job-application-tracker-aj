import { expect, test, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PASSWORD } from './session.js';

/**
 * The tests supabase/functions/upload/README.md says the function must have
 * (§7.3, §7.8). API-level, like security.spec.ts: the threat is a signed-in
 * user holding the anon key and their own token, not the app's UI.
 *
 * Account: dev-c, whose storage no UI test touches, so "nothing was stored" can
 * be checked by listing its folders. Signed in against Auth directly — the
 * sign-in function's lockout of dev-c (sign-in-function.spec.ts) is not in play.
 * Only an accepted file counts toward its 20 uploads an hour; this file stores one.
 */

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const FUNCTION_URL = `${URL}/functions/v1/upload`;

test.skip(({ browserName }) => browserName !== 'chromium', 'API-only; runs once');
test.describe.configure({ mode: 'serial' });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = Buffer.from('%PDF-1.4 test');
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A PNG header claiming these pixels; the function reads the header, never decodes. */
function pngHeader(width: number, height: number, length = 33): Buffer {
  const b = Buffer.alloc(length);
  PNG.copy(b, 0, 0, 16); // signature + IHDR length and type
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

let client: SupabaseClient;
let token: string;
let userId: string;

test.beforeAll(async () => {
  client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: 'dev-c@example.test', password: PASSWORD });
  expect(error, 'seed user missing — run npm run db:reset').toBeNull();
  token = data.session!.access_token;
  userId = data.user!.id;
});

function upload(request: APIRequestContext, kind: string, body: Buffer, contentType: string, auth = token) {
  return request.post(`${FUNCTION_URL}/${kind}`, {
    headers: { authorization: `Bearer ${auth}`, 'content-type': contentType },
    data: body,
  });
}

async function stored(): Promise<string[]> {
  const names: string[] = [];
  for (const bucket of ['avatars', 'cover-letters']) {
    const { data, error } = await client.storage.from(bucket).list(userId);
    expect(error).toBeNull();
    names.push(...(data ?? []).map((f) => `${bucket}/${f.name}`));
  }
  return names.sort();
}

test('a signed-in user cannot write to either bucket directly', async () => {
  const attempts = [
    { bucket: 'avatars', ext: 'png', body: new Blob([PNG], { type: 'image/png' }) },
    { bucket: 'cover-letters', ext: 'pdf', body: new Blob([PDF], { type: 'application/pdf' }) },
  ];
  for (const { bucket, ext, body } of attempts) {
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from(bucket).upload(path, body);
    expect(error, `${bucket} accepted a direct upload`).not.toBeNull();
    const { error: upsertError } = await client.storage.from(bucket).upload(path, body, { upsert: true });
    expect(upsertError, `${bucket} accepted a direct upsert`).not.toBeNull();
  }
  expect(await stored()).toEqual([]);
});

test('files are refused by their bytes, whatever they are called — and nothing is stored', async ({ request }) => {
  const before = await stored();

  // An SVG sent as a PNG, and as a PDF: the declared type is not read.
  expect((await upload(request, 'avatar', SVG, 'image/png')).status()).toBe(415);
  expect((await upload(request, 'cover-letter', SVG, 'application/pdf')).status()).toBe(415);
  // A zip signature with no Word document behind it.
  expect((await upload(request, 'cover-letter', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), DOCX)).status()).toBe(415);
  // A PNG sent as a cover letter: right format, wrong kind.
  expect((await upload(request, 'cover-letter', PNG, 'application/pdf')).status()).toBe(415);
  // One byte over the 2 MB cap, and one pixel over 4000.
  expect((await upload(request, 'avatar', pngHeader(10, 10, 2 * 1024 * 1024 + 1), 'image/png')).status()).toBe(413);
  expect((await upload(request, 'avatar', pngHeader(4001, 10), 'image/png')).status()).toBe(422);

  expect(await stored()).toEqual(before);
});

test('an accepted file lands in its uploader’s folder with the sniffed type', async ({ request }) => {
  const res = await upload(request, 'avatar', PNG, 'text/html');
  expect(res.status()).toBe(201);
  const { path } = (await res.json()) as { path: string };

  try {
    expect(path).toMatch(new RegExp(`^${userId}/[0-9a-f-]{36}\\.png$`));
    const { data, error } = await client.storage.from('avatars').download(path);
    expect(error).toBeNull();
    expect(data?.type).toBe('image/png'); // not the text/html it was sent as
  } finally {
    await client.storage.from('avatars').remove([path]);
  }
});

test('no signed-in user, no upload', async ({ request }) => {
  const missing = await request.post(`${FUNCTION_URL}/avatar`, {
    headers: { 'content-type': 'image/png' },
    data: PNG,
  });
  expect(missing.status()).toBe(401);
  // The anon key is a valid JWT — the gateway lets it through — but it is nobody.
  expect((await upload(request, 'avatar', PNG, 'image/png', ANON)).status()).toBe(401);
});

test('an unknown kind is refused before anything is read', async ({ request }) => {
  expect((await upload(request, 'avatars', PNG, 'image/png')).status()).toBe(404);
});

test('a refusal sent before the checks still reads the body, so the function keeps answering', async ({ request }) => {
  // Bigger than one chunk: a small body arrives whole and never showed the bug.
  // Refused before reading it, the edge runtime never completed the response, and
  // the stuck worker stopped the function answering anything after it (CLAUDE.md).
  const large = Buffer.alloc(1024 * 1024);
  const options = { timeout: 15_000 };

  expect((await request.post(`${FUNCTION_URL}/avatars`, { headers: { authorization: `Bearer ${token}` }, data: large, ...options })).status()).toBe(404);
  // The anon key passes the gateway but is nobody — what an ended session's token meets.
  expect((await request.post(`${FUNCTION_URL}/avatar`, { headers: { authorization: `Bearer ${ANON}` }, data: large, ...options })).status()).toBe(401);
  expect((await request.put(`${FUNCTION_URL}/avatar`, { headers: { authorization: `Bearer ${token}` }, data: large, ...options })).status()).toBe(405);

  // And the function still answers the next request. A refused file, so no upload is spent.
  expect((await request.post(`${FUNCTION_URL}/avatar`, { headers: { authorization: `Bearer ${token}` }, data: SVG, ...options })).status()).toBe(415);
});

test('the function answers CORS only for allowlisted origins (§7.5)', async ({ request }) => {
  // As in sign-in-function.spec.ts: local Kong answers preflights itself with `*`,
  // so this checks the function's own headers, which are what reach the browser hosted.
  const allowed = await request.post(`${FUNCTION_URL}/nothing`, {
    headers: { origin: 'http://localhost:5173', authorization: `Bearer ${token}` },
  });
  const denied = await request.post(`${FUNCTION_URL}/nothing`, {
    headers: { origin: 'https://evil.test', authorization: `Bearer ${token}` },
  });
  expect(allowed.headers()['access-control-allow-origin']).toMatch(/^(http:\/\/localhost:5173|\*)$/);
  expect(denied.headers()['access-control-allow-origin'] ?? '').not.toBe('https://evil.test');
});
