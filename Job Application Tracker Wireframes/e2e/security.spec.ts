import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The checks SPEC §7.8 requires as tests rather than manual steps.
 *
 * They run against the RLS policies directly, using the anon key exactly as the
 * browser holds it — that is the threat model. A UI-level test would only prove
 * that the UI hides the data.
 *
 * They fail until the schema is applied and the seed users exist. Get them
 * passing by fixing policies, never by softening an assertion.
 */

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_A_APPLICATION = 'a0000000-0000-0000-0000-000000000001';
const PASSWORD = 'devpassword1234';

async function signIn(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error, 'seed user missing — run npm run db:reset').toBeNull();
  return client;
}

/** The only way into Storage: the upload function, as the app calls it (§7.3). */
async function uploadThroughFunction(
  client: SupabaseClient,
  kind: 'avatar' | 'cover-letter',
  body: BlobPart,
): Promise<string> {
  const { data, error } = await client.functions.invoke(`upload/${kind}`, { body: new Blob([body]) });
  expect(error, 'upload function refused the file or is not being served').toBeNull();
  return (data as { path: string }).path;
}

test.describe('7.8.1 cross-user isolation', () => {
  test('user B cannot read user A application by id', async () => {
    const b = await signIn('dev-b@example.test');
    const { data, error } = await b.from('applications').select('*').eq('id', USER_A_APPLICATION);

    // Zero rows and no error: RLS filters, it does not announce. An error here
    // would leak that the row exists.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('user B cannot write user A application', async () => {
    const b = await signIn('dev-b@example.test');

    const { data: updated } = await b
      .from('applications')
      .update({ company: 'Owned' })
      .eq('id', USER_A_APPLICATION)
      .select();
    expect(updated ?? []).toEqual([]);

    const { data: deleted } = await b
      .from('applications')
      .delete()
      .eq('id', USER_A_APPLICATION)
      .select();
    expect(deleted ?? []).toEqual([]);

    const a = await signIn('dev-a@example.test');
    const { data: still } = await a
      .from('applications')
      .select('company')
      .eq('id', USER_A_APPLICATION)
      .single();
    expect(still?.company).not.toBe('Owned');
  });

  test('user B cannot insert a row owned by user A', async () => {
    const b = await signIn('dev-b@example.test');
    const { error } = await b.from('applications').insert({
      user_id: USER_A,
      company: 'Forged',
      position: 'Forged',
      date_applied: '2026-09-10T00:00:00.000Z',
    });
    // The insert policy's WITH CHECK is what rejects this.
    expect(error).not.toBeNull();
  });

  test('user B cannot read user A notes through the parent', async () => {
    const b = await signIn('dev-b@example.test');
    const { data } = await b.from('notes').select('*').eq('application_id', USER_A_APPLICATION);
    expect(data ?? []).toEqual([]);
  });

  test('the log tables are write-only', async () => {
    const b = await signIn('dev-b@example.test');

    const { error: insertError } = await b
      .from('app_errors')
      .insert({ message: 'test', route: '/applications' });
    expect(insertError).toBeNull();

    // No select policy at all: a user reading this table reads other people's
    // stack traces (§7.7).
    const { data } = await b.from('app_errors').select('*');
    expect(data ?? []).toEqual([]);
  });

  test('status_history rejects update and delete', async () => {
    const a = await signIn('dev-a@example.test');
    const { data: rows } = await a
      .from('status_history')
      .select('id')
      .eq('application_id', USER_A_APPLICATION)
      .limit(1);
    const id = rows?.[0]?.id as string | undefined;
    test.skip(!id, 'no history rows seeded');

    const { data: updated } = await a
      .from('status_history')
      .update({ to_status: 'Offer' })
      .eq('id', id!)
      .select();
    expect(updated ?? []).toEqual([]);

    const { data: removed } = await a.from('status_history').delete().eq('id', id!).select();
    expect(removed ?? []).toEqual([]);
  });
});

test.describe('7.8.4 delete leaves nothing behind', () => {
  test('deleting an application removes its notes, history, and file', async () => {
    const a = await signIn('dev-a@example.test');
    const { data: user } = await a.auth.getUser();
    const userId = user.user!.id;

    const { data: created, error: createError } = await a
      .from('applications')
      .insert({
        company: 'Doomed Co',
        position: 'Tester',
        date_applied: '2026-09-10T00:00:00.000Z',
      })
      .select()
      .single();
    expect(createError).toBeNull();
    const id = created!.id as string;

    await a.from('notes').insert({ application_id: id, body: 'note that should not survive' });
    await a
      .from('status_history')
      .insert({ application_id: id, from_status: null, to_status: 'Applied' });

    const path = await uploadThroughFunction(a, 'cover-letter', '%PDF-1.4 test');
    await a
      .from('applications')
      .update({ cover_letter_path: path, cover_letter_name: 'test.pdf' })
      .eq('id', id);

    // TODO(delete-application): replace these two calls with
    // services/delete-application.ts as soon as that file exists. Right now this
    // test proves the cascade and the Storage policy work; it does NOT prove the
    // app's own delete path cleans up, which is the thing SPEC §7.8.4 is actually
    // asking about. Deleting by hand here and calling it covered is the failure
    // mode this comment exists to prevent.
    const { error: removeError } = await a.storage.from('cover-letters').remove([path]);
    expect(removeError).toBeNull();
    const { error: deleteError } = await a.from('applications').delete().eq('id', id);
    expect(deleteError, 'the delete itself failed — the checks below would blame the cascade').toBeNull();

    const { data: notes } = await a.from('notes').select('id').eq('application_id', id);
    expect(notes ?? []).toEqual([]);

    const { data: history } = await a.from('status_history').select('id').eq('application_id', id);
    expect(history ?? []).toEqual([]);

    const { data: files } = await a.storage.from('cover-letters').list(userId);
    expect((files ?? []).some((f) => path.endsWith(`/${f.name}`))).toBe(false);
  });
});

test.describe('7.8.1 cross-user isolation — profile and photo (§6 step 1)', () => {
  const USER_B = '22222222-2222-2222-2222-222222222222';
  const PNG = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );

  test('user B cannot read or rewrite user A profile', async () => {
    const b = await signIn('dev-b@example.test');

    const { data: read, error: readError } = await b.from('profiles').select('*').eq('id', USER_A);
    expect(readError).toBeNull();
    expect(read).toEqual([]);

    const { data: updated } = await b
      .from('profiles')
      .update({ avatar_path: `${USER_B}/pointed-at-mine.png` })
      .eq('id', USER_A)
      .select();
    expect(updated ?? []).toEqual([]);

    // data/profile.ts upserts; the insert half's WITH CHECK is what refuses this.
    const { error: upsertError } = await b.from('profiles').upsert({ id: USER_A, avatar_path: null });
    expect(upsertError).not.toBeNull();
  });

  test('user B cannot read, list, overwrite, or delete user A photo', async () => {
    const a = await signIn('dev-a@example.test');
    const path = await uploadThroughFunction(a, 'avatar', PNG);
    expect(path.startsWith(`${USER_A}/`)).toBe(true);

    try {
      const b = await signIn('dev-b@example.test');

      const { data: downloaded } = await b.storage.from('avatars').download(path);
      expect(downloaded).toBeNull();

      const { data: listed } = await b.storage.from('avatars').list(USER_A);
      expect(listed ?? []).toEqual([]);

      // Refused twice over: no user writes to Storage directly (upload-function.spec.ts),
      // and the path is not B's.
      const { error: forgeError } = await b.storage
        .from('avatars')
        .upload(`${USER_A}/${crypto.randomUUID()}.png`, new Blob([PNG], { type: 'image/png' }));
      expect(forgeError).not.toBeNull();

      const { data: removed } = await b.storage.from('avatars').remove([path]);
      expect(removed ?? []).toEqual([]);

      // Still there for its owner: the delete above was refused, not merely unreported.
      const { data: stillThere } = await a.storage.from('avatars').list(USER_A);
      expect((stillThere ?? []).some((f) => path.endsWith(f.name))).toBe(true);
    } finally {
      await a.storage.from('avatars').remove([path]);
    }
  });
});
