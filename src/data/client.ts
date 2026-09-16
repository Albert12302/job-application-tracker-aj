import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * The one Supabase client, anon key only (SPEC §7.4). Nothing outside data/
 * imports this — components reach the database through queries/ hooks.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example.');
}

/** Where supabase-js keeps the session. Named, not derived, because data/auth.ts reads it directly. */
export const AUTH_STORAGE_KEY = 'aj-hunt-auth';

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    // No auth links are handled yet; verify and reset (§4.1b–d) turn this on with their routes.
    detectSessionInUrl: false,
  },
});
