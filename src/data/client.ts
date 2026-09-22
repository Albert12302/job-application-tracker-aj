import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The one Supabase client, anon key only (SPEC §7.4). Nothing outside data/
 * imports this — components reach the database through queries/ hooks.
 */

function requireEnv(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example.');
  }
  return { url, anonKey };
}

const { url, anonKey } = requireEnv();

/** Where supabase-js keeps the session. Named, not derived, because data/auth.ts reads it directly. */
export const AUTH_STORAGE_KEY = 'aj-hunt-auth';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // Stays off, including now that the reset link is handled (§4.1d). A
    // recovery link carries a real session, so letting supabase-js adopt it
    // here would sign the visitor in: the router guards would wave them into
    // the app, and §4.1d's "returns to sign-in rather than auto-signing-in"
    // would be a redirect racing a session that already exists. data/auth.ts
    // reads that fragment itself and spends it on the one request it is for
    // (createRecoveryClient below), so the app's session never changes.
    detectSessionInUrl: false,
  },
});

/**
 * A second client for one request, holding the recovery link's session and
 * storing nothing (§4.1d). It writes no storage key, refreshes nothing, and is
 * dropped when the reset finishes, so the only thing that token ever does is
 * set the password it was emailed for.
 *
 * `createClient` still lives in exactly this file — the rule is that nothing
 * outside `data/` builds a Supabase client, not that there is only ever one
 * object.
 */
export function createRecoveryClient(): typeof supabase {
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
