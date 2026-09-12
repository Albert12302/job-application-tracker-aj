import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * The three tests supabase/functions/sign-in/README.md says the function must
 * have (§7.8). They call the function over HTTP exactly as the browser does.
 *
 * Accounts: dev-c exists only to be locked out; dev-a is used for the
 * clear-on-success and timing checks, and each test that fails dev-a's password
 * ends with a correct sign-in, which clears its count again.
 */

const FUNCTION_URL = `${process.env.VITE_SUPABASE_URL}/functions/v1/sign-in`;
const PASSWORD = 'devpassword1234';

// One run only: two browser projects would double every failure count.
test.skip(({ browserName }) => browserName !== 'chromium', 'API-only; runs once');
test.describe.configure({ mode: 'serial' });

async function attempt(request: APIRequestContext, email: string, password: string) {
  const started = Date.now();
  const res = await request.post(FUNCTION_URL, { data: { email, password } });
  return { status: res.status(), body: (await res.json()) as Record<string, unknown>, ms: Date.now() - started };
}

const unknownEmail = () => `nobody-${crypto.randomUUID()}@example.test`;

test('a successful sign-in clears the failure count', async ({ request }) => {
  test.setTimeout(60_000);
  expect((await attempt(request, 'dev-a@example.test', PASSWORD)).status).toBe(200); // start from zero

  for (let i = 0; i < 4; i++) expect((await attempt(request, 'dev-a@example.test', 'wrong password')).status).toBe(401);
  expect((await attempt(request, 'dev-a@example.test', PASSWORD)).status).toBe(200);

  // Without the clear, these would make eight failures in the window and lock the account.
  for (let i = 0; i < 4; i++) expect((await attempt(request, 'dev-a@example.test', 'wrong password')).status).toBe(401);
  const last = await attempt(request, 'dev-a@example.test', PASSWORD);
  expect(last.status).toBe(200);
  expect(last.body).toHaveProperty('session.access_token');
});

test('an unknown email and a wrong password are indistinguishable', async ({ request }) => {
  test.setTimeout(60_000);
  // Interleaved, and each unknown address is fresh, so both sides see the same backoff.
  const wrong = [];
  const unknown = [];
  for (let i = 0; i < 3; i++) {
    unknown.push(await attempt(request, unknownEmail(), 'wrong password'));
    wrong.push(await attempt(request, 'dev-a@example.test', 'wrong password'));
    expect((await attempt(request, 'dev-a@example.test', PASSWORD)).status).toBe(200); // reset dev-a's count
  }

  for (const r of [...wrong, ...unknown]) {
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'That email and password combination is incorrect.' });
  }
  // Medians, not means: a timing leak is systematic and shows in every sample,
  // while one request delayed by a busy machine moves a three-sample mean by
  // more than the whole threshold.
  const median = (rs: { ms: number }[]) => {
    const sorted = rs.map((r) => r.ms).sort((a, b) => a - b);
    return sorted[(sorted.length - 1) >> 1]!;
  };
  expect(Math.abs(median(wrong) - median(unknown))).toBeLessThan(100);
});

test('five wrong passwords lock the account; the sixth fails even when correct', async ({ request }) => {
  test.setTimeout(60_000);
  for (let i = 0; i < 5; i++) {
    // 429 if a run within the last 15 minutes already locked dev-c; `db:reset` clears it.
    expect([401, 429]).toContain((await attempt(request, 'dev-c@example.test', 'wrong password')).status);
  }

  const sixth = await attempt(request, 'dev-c@example.test', PASSWORD);
  expect(sixth.status).toBe(429);
  expect(sixth.body).not.toHaveProperty('session');
  expect(sixth.body).toMatchObject({ error: 'Too many attempts.' });
  // The lock runs 15 minutes from the fifth failure, so the wait is at most that.
  expect(sixth.body.retryAfterMinutes).toBeGreaterThanOrEqual(1);
  expect(sixth.body.retryAfterMinutes).toBeLessThanOrEqual(15);
});

test('a locked account and a locked unknown email answer identically (§7.8 check 5)', async ({ request }) => {
  test.setTimeout(90_000);
  const unknown = unknownEmail();
  for (let i = 0; i < 5; i++) {
    // Until it locks, an unknown address answers like any wrong password.
    expect((await attempt(request, unknown, 'wrong password')).status).toBe(401);
    // dev-c may still be locked by the test above or an earlier run; either answer is fine here.
    expect([401, 429]).toContain((await attempt(request, 'dev-c@example.test', 'wrong password')).status);
  }

  const realCorrect = await attempt(request, 'dev-c@example.test', PASSWORD);
  const realWrong = await attempt(request, 'dev-c@example.test', 'wrong password');
  const unknownLocked = await attempt(request, unknown, PASSWORD);

  // The same answer for a real and an unknown address, and — during the lock — for the
  // correct password and a wrong one. Only the wait may differ: the locks began at different times.
  const shape = (r: Awaited<ReturnType<typeof attempt>>) => ({
    status: r.status,
    error: r.body.error,
    fields: Object.keys(r.body).sort(),
  });
  expect(shape(realCorrect)).toEqual({ status: 429, error: 'Too many attempts.', fields: ['error', 'retryAfterMinutes'] });
  expect(shape(realWrong)).toEqual(shape(realCorrect));
  expect(shape(unknownLocked)).toEqual(shape(realCorrect));
  expect(Math.abs(realCorrect.ms - unknownLocked.ms)).toBeLessThan(250);
});

test('the function answers CORS only for allowlisted origins (§7.5)', async ({ request }) => {
  // Local Kong answers preflights itself with `*`, so this checks the function's
  // own headers on the POST, which is what reaches the browser when hosted.
  const allowed = await request.post(FUNCTION_URL, {
    headers: { origin: 'http://localhost:5173' },
    data: { email: '', password: '' },
  });
  const denied = await request.post(FUNCTION_URL, {
    headers: { origin: 'https://evil.test' },
    data: { email: '', password: '' },
  });
  expect(allowed.headers()['access-control-allow-origin']).toMatch(/^(http:\/\/localhost:5173|\*)$/);
  expect(denied.headers()['access-control-allow-origin'] ?? '').not.toBe('https://evil.test');
});
