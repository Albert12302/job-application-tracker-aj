import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A user created for one test and destroyed by it (SPEC §9.7).
 *
 * Account deletion destroys the account it runs as, so it cannot borrow a seed
 * user: `dev-a` … `dev-g` are each spoken for, and the second browser project
 * would find no account where the first left none. A throwaway user per test
 * is the only shape that is repeatable without `npm run db:reset` between runs.
 *
 * Each user is signed in exactly once, here, and the token handed back: every
 * sign-in shares one provider-side bucket (§7.1, config.toml
 * `sign_in_sign_ups`), so a second one per test would spend that budget twice
 * for nothing.
 *
 * **Local only, and structurally so.** The service-role key comes from
 * `supabase status` in playwright.config.ts — from the stack running on this
 * machine, never from a file and never from the repo — so there is nothing here
 * that could be pointed at a hosted project by accident. `supabase/seed.sql`
 * carries the same warning for the same reason.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

export const THROWAWAY_PASSWORD = 'devpassword1234';

/** A one-pixel PNG, so an avatar upload has real bytes for the magic-byte check (§7.3). */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The local stack's service-role key, resolved once in playwright.config.ts and
 * inherited from there — never read in a worker, which would mean one `supabase`
 * CLI call per worker in the middle of the run.
 */
function localServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('no SUPABASE_SERVICE_ROLE_KEY — is the local stack running? (npx supabase start)');
  return key;
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, localServiceKey(), { auth: { persistSession: false } });
}

export type ThrowawayUser = {
  id: string;
  email: string;
  session: string;
  client: SupabaseClient;
  /** This user's access token, so nothing has to sign in a second time (§7.1). */
  token: string;
  /** Its one application — notes carry no user_id, so they are checked through this. */
  applicationId: string;
  /** What the deletion dialog should count for this user. */
  expected: { applications: number; notes: number; files: number };
};

/**
 * A confirmed user holding one of everything deletion has to take with it: an
 * application, a note under it, a saved filter, a profile, and a stored file in
 * each bucket. Anything that survives the delete then shows up as a failure.
 */
export async function createThrowawayUser(label: string): Promise<ThrowawayUser> {
  const admin = adminClient();
  const email = `delete-${label}-${crypto.randomUUID()}@example.test`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: THROWAWAY_PASSWORD,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`could not create throwaway user: ${createError?.message}`);
  const id = created.user.id;

  const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: THROWAWAY_PASSWORD,
  });
  if (signInError || !signIn.session) throw new Error(`could not sign in throwaway user: ${signInError?.message}`);
  const token = signIn.session.access_token;

  // One application with its first note, through the same function the app uses.
  const { data: application, error: applicationError } = await client.rpc('create_application', {
    p_date_applied: '2026-09-01T00:00:00Z',
    p_company: 'Throwaway Industries',
    p_position: 'Test Engineer',
    p_status: 'Applied',
    p_referral: false,
    p_first_note: 'A note that should not survive the account.',
  });
  if (applicationError) throw new Error(`could not create application: ${applicationError.message}`);
  const applicationId = (application as { id: string }).id;

  const { error: filterError } = await client
    .from('saved_filters')
    .insert({ name: 'Throwaway filter', statuses: ['Applied'], referral: 'any', starred: 'any' });
  if (filterError) throw new Error(`could not create saved filter: ${filterError.message}`);

  // Stored with the service role, not through the upload function. Setup should
  // not exercise machinery it is not testing: every upload spins a fresh edge
  // worker (config.toml `policy = "oneshot"`), and ten of them a run measurably
  // slowed the sign-in function while e2e/sign-in-function.spec.ts was timing
  // it — a real §7.1 check, which a test of something else must not make flake.
  // The upload path has its own coverage in e2e/upload-function.spec.ts and
  // e2e/cover-letters.spec.ts. The objects are real either way, which is all
  // deletion cares about.
  const letter = await storeFile(admin, id, 'cover-letters', 'pdf', Buffer.from('%PDF-1.4 throwaway letter\n%%EOF'));
  const avatar = await storeFile(admin, id, 'avatars', 'png', PNG);

  const { error: attachError } = await client
    .from('applications')
    .update({ cover_letter_path: letter, cover_letter_name: 'Throwaway letter.pdf' })
    .eq('id', applicationId);
  if (attachError) throw new Error(`could not attach the cover letter: ${attachError.message}`);

  const { error: avatarError } = await client.from('profiles').upsert({ id, avatar_path: avatar });
  if (avatarError) throw new Error(`could not set the avatar: ${avatarError.message}`);

  return {
    id,
    email,
    session: JSON.stringify(signIn.session),
    client,
    token,
    applicationId,
    expected: { applications: 1, notes: 1, files: 2 },
  };
}

/** The same `{user_id}/{uuid}.ext` shape the upload function chooses (§7.3). */
async function storeFile(
  admin: SupabaseClient,
  userId: string,
  bucket: string,
  extension: string,
  bytes: Buffer,
): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const contentType = extension === 'pdf' ? 'application/pdf' : 'image/png';
  const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`could not store the ${bucket} object: ${error.message}`);
  return path;
}

/** For a test that did not get as far as deleting its user. Already gone is fine. */
export async function removeThrowawayUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id).catch(() => {});
}
