import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  ACCOUNT_LOCKOUT_MS,
  ACCOUNT_MAX_FAILURES,
  ACCOUNT_WINDOW_MS,
  accountLockout,
  IP_DEFAULT_MAX_FAILURES,
  IP_WINDOW_MS,
  ipBlockedUntil,
  MINUTE,
} from '../supabase/functions/sign-in/limits.ts';
import { adminClient } from './throwaway-user.js';

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

/** A random 64-character hash, shaped like the function's peppered SHA-256 keys. */
const hex = () => crypto.randomUUID().replace(/-/g, '').repeat(2);

type Reservation = { id: string | null; now: string; account: string[]; ip: string[] };

/** begin_sign_in_attempt with the function's real limits, unless a test narrows one. */
async function reserve(emailHash: string, ipHash: string, limits: { accountMax?: number; ipMax?: number } = {}) {
  const { data, error } = await adminClient().rpc('begin_sign_in_attempt', {
    p_email_hash: emailHash,
    p_ip_hash: ipHash,
    p_account_max: limits.accountMax ?? ACCOUNT_MAX_FAILURES,
    p_account_window_ms: ACCOUNT_WINDOW_MS,
    p_account_lockout_ms: ACCOUNT_LOCKOUT_MS,
    p_ip_max: limits.ipMax ?? IP_DEFAULT_MAX_FAILURES,
    p_ip_window_ms: IP_WINDOW_MS,
  });
  if (error) throw new Error(`could not reserve an attempt: ${error.message}`);
  return data as Reservation;
}

/**
 * The database's clock, not this machine's: the Docker/WSL clock can drift from the host's
 * (after sleep especially), and `sign_in_attempts.created_at` is written by the database.
 * Read from a throwaway reservation under random hashes, which is deleted at once.
 */
async function databaseNow(): Promise<number> {
  const probe = await reserve(hex(), hex());
  await adminClient().from('sign_in_attempts').delete().eq('id', probe.id!);
  return Date.parse(probe.now);
}

/** Failure rows `minutesAgo` before `base`, for one account or one address. */
async function plantFailures(key: { email_hash: string } | { ip_hash: string }, base: number, minutesAgo: number[]) {
  const rows = minutesAgo.map((m) => ({
    email_hash: hex(),
    ip_hash: hex(),
    ...key,
    outcome: 'failure',
    created_at: new Date(base - m * MINUTE).toISOString(),
  }));
  const { error } = await adminClient().from('sign_in_attempts').insert(rows);
  if (error) throw new Error(`could not plant failures: ${error.message}`);
}

// When this file's run began, by the database's clock. Rows from before it — left pending by
// an earlier run cut short, say by a container restart — are not this run's to judge.
let runStartedAt = 0;
test.beforeAll(async ({ browserName }) => {
  if (browserName === 'chromium') runStartedAt = await databaseNow();
});

test('attempts arriving together each count the ones before them (§7.1)', async () => {
  // The local edge runtime answers one sign-in at a time, so parallel requests to the
  // function cannot race here the way they do hosted. The guarantee lives in the database
  // (begin_sign_in_attempt), so it is tested there, with genuinely concurrent calls.
  const emailHash = hex();
  // A limit of 20 here, so ten attempts stay below it and every one is recorded.
  const seenBefore = async () => (await reserve(emailHash, hex(), { accountMax: 20 })).account.length;

  try {
    // Unlocked, all ten would read the same count. Locked, each sees every one before it.
    const seen = (await Promise.all(Array.from({ length: 10 }, seenBefore))).sort((a, b) => a - b);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  } finally {
    await adminClient().from('sign_in_attempts').delete().eq('email_hash', emailHash);
  }
});

test('a blocked address writes nothing, so it cannot add to an account’s count (§7.1)', async () => {
  // The attack this stops: an address already blocked floods one account. If each refused
  // attempt were recorded and deleted afterwards, five would sit pending there at any instant
  // and lock the owner out, without one guess reaching Auth.
  const admin = adminClient();
  const blockedIp = hex();
  const otherIp = hex();
  const victim = hex();
  try {
    await plantFailures({ ip_hash: blockedIp }, await databaseNow(), [1, 2, 3]);

    const flood = await Promise.all(Array.from({ length: 10 }, () => reserve(victim, blockedIp, { ipMax: 3 })));
    expect(flood.map((r) => r.id)).toEqual(Array(10).fill(null));

    const { count } = await admin.from('sign_in_attempts').select('id', { count: 'exact', head: true }).eq('email_hash', victim);
    expect(count).toBe(0);

    // The owner, from their own address, finds nothing counted against the account.
    const owner = await reserve(victim, otherIp, { ipMax: 3 });
    expect(owner.id).not.toBeNull();
    expect(owner.account).toEqual([]);
  } finally {
    await admin.from('sign_in_attempts').delete().in('ip_hash', [blockedIp, otherIp]);
  }
});

test('the database blocks exactly when limits.ts does (§7.1)', async () => {
  // The block rule is written twice — SQL decides before writing, limits.ts computes the
  // wait — so they are checked against each other at the edges of each rule.
  const cases: { name: string; account?: number[]; ip?: number[]; blocked: boolean }[] = [
    { name: 'four account failures', account: [1, 2, 3, 4], blocked: false },
    { name: 'five inside 15 minutes', account: [1, 2, 3, 4, 5], blocked: true },
    { name: 'five spanning exactly 15 minutes', account: [1, 2, 3, 4, 16], blocked: true },
    { name: 'five spanning just over 15 minutes', account: [1, 2, 3, 4, 16.05], blocked: false },
    { name: 'lock from the newest with a minute left', account: [14, 15, 16, 17, 18], blocked: true },
    { name: 'lock from the newest a minute over', account: [16, 17, 18, 19, 20], blocked: false },
    { name: 'address at its limit', ip: [1, 2, 3], blocked: true },
    { name: 'address with one failure past the hour', ip: [1, 2, 61], blocked: false },
    // Six seconds inside, not one: planting and reserving take a few calls, and a busy
    // machine must not push the oldest failure past the hour before the check runs.
    { name: 'address with all three just inside the hour', ip: [59.8, 59.85, 59.9], blocked: true },
  ];

  const admin = adminClient();
  for (const c of cases) {
    const emailHash = hex();
    const ipHash = hex();
    try {
      const base = await databaseNow();
      if (c.account) await plantFailures({ email_hash: emailHash }, base, c.account);
      if (c.ip) await plantFailures({ ip_hash: ipHash }, base, c.ip);

      const r = await reserve(emailHash, ipHash, { ipMax: 3 });
      const now = Date.parse(r.now);
      const times = (ts: string[]) => ts.map((t) => Date.parse(t));
      const inTypeScript =
        accountLockout(times(r.account), now).lockedUntil > 0 || ipBlockedUntil(times(r.ip), now, 3) > 0;

      expect({ case: c.name, sql: r.id === null }).toEqual({ case: c.name, sql: c.blocked });
      expect({ case: c.name, typescript: inTypeScript }).toEqual({ case: c.name, typescript: c.blocked });
    } finally {
      await admin.from('sign_in_attempts').delete().or(`email_hash.eq.${emailHash},ip_hash.eq.${ipHash}`);
    }
  }
});

test('the function settles every attempt it reserves', async () => {
  // Runs after the tests above, serially. A pending row is only ever seconds old; one
  // older than that means an outcome was never recorded, and it would count as a
  // failure for its whole window. Only rows from this run, and both bounds by the
  // database's clock; the 30 s spares sign-ins other suites have in flight.
  expect(runStartedAt).toBeGreaterThan(0);
  const now = await databaseNow();
  const { count, error } = await adminClient()
    .from('sign_in_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('outcome', 'pending')
    .gte('created_at', new Date(runStartedAt).toISOString())
    .lt('created_at', new Date(now - 30_000).toISOString());
  expect(error).toBeNull();
  expect(count).toBe(0);
});
