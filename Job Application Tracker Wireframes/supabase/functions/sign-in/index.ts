// Per-account sign-in lockout (SPEC §7.1).
//
// Why this exists as an edge function: every other limit in §7.1 is either
// per-IP (Supabase Auth owns those, see config.toml) or counts something the
// database itself sees (writes, uploads — triggers own those). A per-ACCOUNT
// failure count is neither. It has to be recorded on a failed sign-in, and a
// failed sign-in produces no authenticated session, so there is no trustworthy
// client to record it. The counter has to sit behind the credential check.
//
// The client calls this instead of supabase.auth.signInWithPassword.
// It never sees the service role key, and it never learns whether an email
// exists (§7.1: no account enumeration on any surface).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PEPPER = Deno.env.get('SIGN_IN_HASH_PEPPER')!;

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;
const MIN_RESPONSE_MS = 400; // §7.1: response timing must not differ

// Same generic copy for bad credentials, unknown email, and lockout (§8.2).
const GENERIC = 'That email and password combination is incorrect.';
const LOCKED = 'Too many attempts. Try again in about 15 minutes.';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** SHA-256 of pepper + lowercased email. The address itself is never stored (§7.7). */
async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(PEPPER + email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-content-type-options': 'nosniff' },
  });
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  // Constant-ish response time, so a locked or unknown account is not
  // distinguishable by how fast it answers.
  const settle = async (body: unknown, status: number) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_RESPONSE_MS) await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    return json(body, status);
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

  const emailHash = await hashEmail(email);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { count: failures } = await admin
    .from('sign_in_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('email_hash', emailHash)
    .eq('outcome', 'failure')
    .gte('created_at', since);

  if ((failures ?? 0) >= MAX_FAILURES) {
    await admin.from('security_events').insert({ event_type: 'rate_limit_trip', outcome: 'denied' });
    // Exponential backoff on top of the window, then the flat lockout.
    const backoff = Math.min(2 ** ((failures ?? 0) - MAX_FAILURES), 8) * 250;
    await new Promise((r) => setTimeout(r, backoff));
    return settle({ error: LOCKED, retryAfterMinutes: LOCKOUT_MINUTES }, 429);
  }

  const auth = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    await admin.from('sign_in_attempts').insert({ email_hash: emailHash, outcome: 'failure' });
    await admin.from('security_events').insert({ event_type: 'sign_in_failure', outcome: 'failure' });
    return settle({ error: GENERIC }, 401);
  }

  // Clear the account's failure history on success, so a legitimate user who
  // fumbled twice is not one typo away from a lockout.
  await admin.from('sign_in_attempts').delete().eq('email_hash', emailHash).eq('outcome', 'failure');
  await admin.from('sign_in_attempts').insert({ email_hash: emailHash, outcome: 'success' });
  await admin
    .from('security_events')
    .insert({ user_id: data.user!.id, event_type: 'sign_in_success', outcome: 'success' });

  // The session goes back to the client, which calls setSession with it.
  return settle({ session: data.session }, 200);
});
