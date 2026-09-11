import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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

    const path = `${userId}/${id}.pdf`;
    await a.storage
      .from('cover-letters')
      .upload(path, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }));
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
    await a.storage.from('cover-letters').remove([path]);
    await a.from('applications').delete().eq('id', id);

    const { data: notes } = await a.from('notes').select('id').eq('application_id', id);
    expect(notes ?? []).toEqual([]);

    const { data: history } = await a.from('status_history').select('id').eq('application_id', id);
    expect(history ?? []).toEqual([]);

    const { data: files } = await a.storage.from('cover-letters').list(userId);
    expect((files ?? []).some((f) => f.name === `${id}.pdf`)).toBe(false);
  });
});
