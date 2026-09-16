// Sign-in limits per account AND per IP (SPEC §7.1).
//
// Why this exists as an edge function: every other limit in §7.1 counts
// something another component already sees — writes (triggers own those),
// uploads (the upload function, Storage's only writer). A sign-in failure count
// is neither. It has to be recorded on a failed sign-in,
// and a failed sign-in produces no authenticated session, so there is no
// trustworthy client to record it. The counter has to sit behind the credential
// check.
//
// Both limits live here, not in config.toml: behind this function, Supabase
// Auth sees one caller for every sign-in — the function — so Auth's own per-IP
// limit is a single bucket shared by everyone. Only this function sees the
// caller's address, and it checks both counts before Auth is ever called, so a
// blocked caller cannot drain that shared bucket either.
//
// The client calls this instead of supabase.auth.signInWithPassword. A script
// can still call Auth's password endpoint directly with the anon key and skip
// these limits; that is an accepted risk (SPEC §7.1), revisited before sign-up opens.
// It never sees the service role key, and it never learns whether an email
// exists (§7.1: no account enumeration on any surface).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, parseOrigins } from '../_shared/cors.ts';
import {
  ACCOUNT_LOCKOUT_MS,
  ACCOUNT_MAX_FAILURES,
  ACCOUNT_WINDOW_MS,
  accountLockout,
  authFailure,
  backoffMs,
  clientIp,
  IP_DEFAULT_MAX_FAILURES,
  IP_WINDOW_MS,
  ipBlockedUntil,
  parseLimit,
  retryAfterMinutes,
  STALE_PENDING_MS,
} from './limits.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PEPPER = Deno.env.get('SIGN_IN_HASH_PEPPER')!;
// §7.5 — see _shared/cors.ts.
const ALLOWED_ORIGINS = parseOrigins(Deno.env.get('ALLOWED_ORIGINS'));

// 20 by default (§7.1). Raised only in the local env file: every local request
// reaches the function from one Docker address, so a single e2e run would block
// the next one for an hour. Never set it on the hosted project.
const IP_MAX_FAILURES = parseLimit(Deno.env.get('SIGN_IN_IP_MAX_FAILURES'), IP_DEFAULT_MAX_FAILURES);

// §7.1: response timing must not differ. The floor has to sit above the real
// work (the counter queries, the Auth call, the inserts — ~500 ms locally), or
// it pads nothing and the password hash check a real account costs shows through.
const MIN_RESPONSE_MS = 1000;

// One generic message for bad credentials and unknown email (§8.2). One for
// every block, account or IP alike — the body never says which.
const GENERIC = 'That email and password combination is incorrect.';
const LOCKED = 'Too many attempts.';
const UNAVAILABLE = 'Sign-in is unavailable right now. Try again shortly.';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Peppered hashes: lookup keys, never the address or email itself (§7.7). */
const hashEmail = (email: string) => sha256(PEPPER + email.trim().toLowerCase());
const hashIp = (ip: string) => sha256(`${PEPPER}ip:${ip}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const times = (timestamps: string[]) => timestamps.map((t) => Date.parse(t));

/** `id` is null when the database found the attempt blocked and recorded nothing. */
type Reservation = { id: string | null; now: string; account: string[]; ip: string[] };

/**
 * Reads the failures before this attempt, newest first, and records it as pending
 * unless it is blocked — in one locked transaction (migration 20260916181344).
 * Pending attempts count as failures, so requests arriving together see each
 * other instead of all reading the same count. A blocked attempt writes nothing,
 * so it can never add to anyone's count.
 */
function reserveAttempt(emailHash: string, ipHash: string) {
  return admin.rpc('begin_sign_in_attempt', {
    p_email_hash: emailHash,
    p_ip_hash: ipHash,
    p_account_max: ACCOUNT_MAX_FAILURES,
    p_account_window_ms: ACCOUNT_WINDOW_MS,
    p_account_lockout_ms: ACCOUNT_LOCKOUT_MS,
    p_ip_max: IP_MAX_FAILURES,
    p_ip_window_ms: IP_WINDOW_MS,
  });
}

/**
 * A write that settles an attempt's row, retried: a lost write leaves the row
 * pending, and pending counts as a failure for the whole window.
 */
async function settleAttempt(write: () => PromiseLike<{ error: unknown }>): Promise<void> {
  for (let tries = 0; tries < 3; tries++) {
    if (tries) await sleep(100 * 2 ** tries);
    const { error } = await write();
    if (!error) return;
  }
  console.error('sign-in: an attempt could not be settled and counts as a failure until it ages out');
}

/** Removes an attempt that must count for nothing: Auth rate limited or unavailable. */
const discardAttempt = (id: string) => settleAttempt(() => admin.from('sign_in_attempts').delete().eq('id', id));

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const cors = corsHeaders(req.headers.get('origin'), ALLOWED_ORIGINS);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Constant-ish response time, so a locked or unknown account is not
  // distinguishable by how fast it answers.
  const settle = async (body: unknown, status: number) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) await sleep(MIN_RESPONSE_MS - elapsed);
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json', 'x-content-type-options': 'nosniff' },
    });
  };

  if (req.method !== 'POST') return settle({ error: GENERIC }, 405);

  let email: unknown, password: unknown;
  try {
    ({ email, password } = await req.json());
  } catch {
    return settle({ error: GENERIC }, 400);
  }
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return settle({ error: 'Enter an email and password.' }, 400);
  }
  if (email.length > 254 || password.length > 128) return settle({ error: GENERIC }, 400);

  const [emailHash, ipHash] = await Promise.all([hashEmail(email), hashIp(clientIp(req.headers))]);
  const reserved = await reserveAttempt(emailHash, ipHash);

  // Fail closed: if a counter cannot be read, its limit cannot be enforced.
  if (reserved.error || !reserved.data) return settle({ error: UNAVAILABLE }, 503);
  const attempt = reserved.data as Reservation;
  // The database's instant, the one it decided with, so both sides see the same times.
  const now = Date.parse(attempt.now);

  const ipUntil = ipBlockedUntil(times(attempt.ip), now, IP_MAX_FAILURES);
  const { inWindow, lockedUntil } = accountLockout(times(attempt.account), now);
  const blockedUntil = Math.max(ipUntil, lockedUntil);

  if (!attempt.id || blockedUntil) {
    // Nothing is recorded while blocked: the counts stop growing, so the block
    // ends on schedule instead of extending with every retry, and a blocked
    // caller cannot add to another account's count. The database makes that
    // call before writing; the two rules are kept identical (see the migration),
    // and if they ever disagree the attempt is refused either way.
    if (attempt.id) await discardAttempt(attempt.id);
    await admin.from('security_events').insert({ event_type: 'rate_limit_trip', outcome: 'denied' });
    return settle({ error: LOCKED, retryAfterMinutes: retryAfterMinutes(Math.max(blockedUntil, now), now) }, 429);
  }
  const attemptId = attempt.id;

  // Keyed on the hash, so an unknown email backs off exactly like a real one.
  await sleep(backoffMs(inWindow));

  const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    // Only a credential rejection counts (limits.ts authFailure).
    const outcome = authFailure(error?.status);
    if (outcome !== 'rejected') {
      await discardAttempt(attemptId);
      if (outcome === 'rate-limited') return settle({ error: LOCKED, retryAfterMinutes: 5 }, 429);
      return settle({ error: UNAVAILABLE }, 503);
    }

    // If this never lands the row stays pending, which counts as a failure too.
    await settleAttempt(() => admin.from('sign_in_attempts').update({ outcome: 'failure' }).eq('id', attemptId));
    await admin.from('security_events').insert({ event_type: 'sign_in_failure', outcome: 'failure' });
    return settle({ error: GENERIC }, 401);
  }

  // Clear the account's failures on success, so a legitimate user who fumbled
  // twice is not one typo away from a lockout. The IP's failures stay: one
  // valid account must not be a way to reset an address that is spraying others.
  // Pending attempts still in flight are theirs to settle; one older than any
  // live request (STALE_PENDING_MS) died unsettled and counts as a failure, so
  // it goes with the failures.
  const stale = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  await admin
    .from('sign_in_attempts')
    .delete()
    .eq('email_hash', emailHash)
    .or(`outcome.eq.failure,and(outcome.eq.pending,created_at.lt."${stale}")`);
  await settleAttempt(() => admin.from('sign_in_attempts').update({ outcome: 'success' }).eq('id', attemptId));
  await admin
    .from('security_events')
    .insert({ user_id: data.user!.id, event_type: 'sign_in_success', outcome: 'success' });

  // The session goes back to the client, which calls setSession with it.
  return settle({ session: data.session }, 200);
});
