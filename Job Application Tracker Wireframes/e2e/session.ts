import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A signed-in browser for tests that are not about signing in.
 *
 * Every sign-in through the app reaches Auth from the sign-in function's one
 * address, so they all share a single provider-side bucket (SPEC §7.1,
 * supabase/config.toml). A suite that signs in through the form for every test
 * spends that budget on tests that are testing something else, and the ones
 * that come later are refused and fail for no reason of their own.
 *
 * So: take a session straight from Auth once per spec, and put it where the
 * app looks for it. e2e/auth.spec.ts and e2e/sign-in-function.spec.ts still
 * sign in through the form — that is what they are for.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

export const PASSWORD = 'devpassword1234';

/** src/data/client.ts AUTH_STORAGE_KEY — where supabase-js keeps the session. */
const STORAGE_KEY = 'aj-hunt-auth';

/**
 * One sign-in, giving both halves a spec needs: a client for the rows it sets
 * up or reads back, and the stored session that starts the browser signed in.
 * Signing in twice per spec spends the same budget twice for nothing.
 */
export async function apiActor(email: string): Promise<{ client: SupabaseClient; session: string }> {
  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error, `could not sign in as ${email} — run npm run db:reset`).toBeNull();
  return { client, session: JSON.stringify(data.session) };
}

/** The stored session for `email`, as JSON. Call once per spec, in beforeAll. */
export async function apiSession(email: string): Promise<string> {
  return (await apiActor(email)).session;
}

/** Puts that session in storage before the page loads, so the app starts signed in. */
export async function startSignedIn(page: Page, session: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [STORAGE_KEY, session] as const,
  );
}
