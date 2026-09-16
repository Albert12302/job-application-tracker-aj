// Deleting the account itself (SPEC §9.7).
//
// Why this exists as an edge function: removing a row from auth.users needs the
// service role, and the browser must never hold that key (§7.4). The only
// alternative considered was a SECURITY DEFINER Postgres function deleting from
// auth.users directly — rejected because §7.6 says avoid definer functions, and
// because those tables are GoTrue's: anything its own delete does beyond the
// row cascade would silently become our problem.
//
// The client never says whose account to delete. There is no body and no id
// parameter; who is deleted comes from the token Auth vouches for, so this
// endpoint cannot be pointed at anybody else.
//
// Storage is NOT deleted here. The user already holds select and delete on
// their own folder, so the client does that first and only calls this once it
// has succeeded (§9.7): a failed Storage delete must stop before the account is
// gone, or the files are orphaned with no owner to find them by.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, parseOrigins } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = parseOrigins(Deno.env.get('ALLOWED_ORIGINS'));

const SIGN_IN = 'Sign in to delete your account.';
const UNAVAILABLE = 'Your account could not be deleted right now. Try again shortly.';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * The one record that survives the account (§9.7): an event, an outcome, a
 * timestamp, and the id — nothing else, and never an email.
 *
 * Written with the service role, which force_security_event_owner deliberately
 * exempts (migration 20260910090700), so the id of a user who no longer exists
 * is the one that lands. The foreign key that used to blank it is gone
 * (migration 20260915192815).
 */
async function record(userId: string, outcome: 'success' | 'failure'): Promise<void> {
  const { error } = await admin
    .from('security_events')
    .insert({ user_id: userId, event_type: 'account_deletion', outcome });
  // The account is already gone by the time a success row fails to write, and
  // refusing now would tell the user their deletion failed when it did not.
  // The edge log is where this is noticed; it holds no PII (§7.7).
  if (error) console.error('security_event_insert_failed', error.code ?? 'unknown');
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'), ALLOWED_ORIGINS);
  const reply = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json', 'x-content-type-options': 'nosniff' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Drained to the end before anything is answered, even a refusal: the edge
  // runtime never completes a response sent over an unread body, and the stuck
  // worker stops the function starting again (CLAUDE.md).
  if (req.body) await req.arrayBuffer();

  if (req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);

  // The gateway's verify_jwt checks the signature; this also refuses a signed-out
  // or already-deleted user's still-unexpired token.
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({ error: SIGN_IN }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: SIGN_IN }, 401);
  const userId = auth.user.id;

  // Applications, notes, status history, saved filters and the profile all go
  // with it, by the on-delete cascades their migrations declare. Every refresh
  // token for this user is revoked server-side by the same call, which is what
  // §9.7 means by signing out all sessions — there is no session left to sign
  // out of afterwards.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    await record(userId, 'failure');
    return reply({ error: UNAVAILABLE }, 503);
  }

  await record(userId, 'success');
  return new Response(null, { status: 204, headers: cors });
});
