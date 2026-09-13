import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiSession, startSignedIn } from './session.js';

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
    const { data: rows, error } = await a
      .from('status_history')
      .select('id')
      .eq('application_id', USER_A_APPLICATION)
      .limit(1);
    // Asserted, not skipped: seed.sql always writes these, so an empty answer
    // means the read failed — and a security check that skips itself when it
    // cannot read is a check that never runs.
    expect(error).toBeNull();
    const id = rows?.[0]?.id as string | undefined;
    expect(id, 'seeded history rows missing — run npm run db:reset').toBeTruthy();

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

test.describe('7.8.1 cross-user isolation — the status functions (§6 step 2)', () => {
  test('user B cannot change user A status through change_application_status', async () => {
    const a = await signIn('dev-a@example.test');
    const history = async () =>
      (await a.from('status_history').select('id').eq('application_id', USER_A_APPLICATION)).data ?? [];
    const before = await history();

    const b = await signIn('dev-b@example.test');
    const { data, error } = await b.rpc('change_application_status', {
      p_application_id: USER_A_APPLICATION,
      p_status: 'Offer',
    });
    // The function's "no such application": RLS hid the row, so B learns nothing more.
    expect(data).toBeNull();
    expect(error?.code).toBe('P0002');

    const { data: still } = await a.from('applications').select('status').eq('id', USER_A_APPLICATION).single();
    expect(still?.status).toBe('Callback');
    expect(await history()).toHaveLength(before.length);
  });

  test('signed-out callers cannot run either function', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });

    const { error: changeError } = await anon.rpc('change_application_status', {
      p_application_id: USER_A_APPLICATION,
      p_status: 'Offer',
    });
    expect(changeError).not.toBeNull();

    const { error: createError } = await anon.rpc('create_application', {
      p_date_applied: '2026-09-10T00:00:00.000Z',
      p_company: 'Anon',
      p_position: 'Anon',
      p_status: 'Applied',
      p_referral: false,
    });
    expect(createError).not.toBeNull();
  });
});

test.describe('§2 status history — written with the status, atomically', () => {
  test('creation writes one row from null; a change, one row from the real status; no change, none', async () => {
    const d = await signIn('dev-d@example.test');
    const { data: created, error } = await d.rpc('create_application', {
      p_date_applied: '2026-09-10T00:00:00.000Z',
      p_company: `History ${crypto.randomUUID()}`,
      p_position: 'Tester',
      p_status: 'Applied',
      p_referral: false,
      p_first_note: 'first note',
    });
    expect(error).toBeNull();
    const id = (created as { id: string }).id;

    const history = async () =>
      (
        await d
          .from('status_history')
          .select('from_status, to_status')
          .eq('application_id', id)
          .order('changed_at', { ascending: true })
      ).data ?? [];

    try {
      expect(await history()).toEqual([{ from_status: null, to_status: 'Applied' }]);
      const { data: notes } = await d.from('notes').select('body').eq('application_id', id);
      expect(notes).toEqual([{ body: 'first note' }]);

      const { error: changeError } = await d.rpc('change_application_status', { p_application_id: id, p_status: 'Interview' });
      expect(changeError).toBeNull();
      // Unchanged: §2 says no row, and the table's check constraint would refuse one anyway.
      const { error: sameError } = await d.rpc('change_application_status', { p_application_id: id, p_status: 'Interview' });
      expect(sameError).toBeNull();

      expect(await history()).toEqual([
        { from_status: null, to_status: 'Applied' },
        { from_status: 'Applied', to_status: 'Interview' },
      ]);
    } finally {
      await d.from('applications').delete().eq('id', id);
    }
  });

  test('a creation that fails part-way writes nothing at all', async () => {
    const d = await signIn('dev-d@example.test');
    const company = `Atomic ${crypto.randomUUID()}`;

    // The first note breaks its 2,000-character cap (§7.3), after the
    // application row has been inserted — so the whole transaction must go.
    const { error } = await d.rpc('create_application', {
      p_date_applied: '2026-09-10T00:00:00.000Z',
      p_company: company,
      p_position: 'Tester',
      p_status: 'Applied',
      p_referral: false,
      p_first_note: 'x'.repeat(2001),
    });
    expect(error).not.toBeNull();

    const { data } = await d.from('applications').select('id').eq('company', company);
    expect(data).toEqual([]);
  });
});

test.describe('§7.3 field caps are enforced by Postgres, not only the form', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-only; runs once');

  test('a job description of 15,000 characters saves, and one of 15,001 is refused', async () => {
    const d = await signIn('dev-d@example.test');
    const base = {
      p_date_applied: '2026-09-10T00:00:00.000Z',
      p_position: 'Tester',
      p_status: 'Applied',
      p_referral: false,
    };

    const { data: atCap, error: atCapError } = await d.rpc('create_application', {
      ...base,
      p_company: `Cap ${crypto.randomUUID().slice(0, 8)}`,
      p_description: 'x'.repeat(15000),
    });
    expect(atCapError).toBeNull();

    try {
      const company = `Over cap ${crypto.randomUUID().slice(0, 8)}`;
      const { error: overError } = await d.rpc('create_application', {
        ...base,
        p_company: company,
        p_description: 'x'.repeat(15001),
      });
      expect(overError?.code).toBe('23514'); // check_violation
      const { data: none } = await d.from('applications').select('id').eq('company', company);
      expect(none).toEqual([]);

      // An edit is held to the same cap as a create.
      const id = (atCap as { id: string }).id;
      const { error: editError } = await d.from('applications').update({ description: 'x'.repeat(15001) }).eq('id', id);
      expect(editError?.code).toBe('23514');
    } finally {
      await d.from('applications').delete().eq('id', (atCap as { id: string }).id);
    }
  });
});

test.describe('7.8.4 delete leaves nothing behind', () => {
  /**
   * Driven through the screen rather than the tables: the delete this checks
   * has to be services/delete-application.ts, the path that ships. Deleting by
   * hand here would prove the cascade works and nothing about the app.
   *
   * As dev-d, whose applications no other suite counts.
   */
  test('deleting an application removes its notes, history, and file', async ({ page }) => {
    const d = await signIn('dev-d@example.test');
    const { data: user } = await d.auth.getUser();
    const userId = user.user!.id;

    const company = `Doomed ${crypto.randomUUID().slice(0, 8)}`;
    const { data: created, error: createError } = await d.rpc('create_application', {
      p_date_applied: '2026-09-10T00:00:00.000Z',
      p_company: company,
      p_position: 'Tester',
      p_status: 'Applied',
      p_referral: false,
      p_first_note: 'note that should not survive',
    });
    expect(createError).toBeNull();
    const id = (created as { id: string }).id;

    const path = await uploadThroughFunction(d, 'cover-letter', '%PDF-1.4 test');
    await d
      .from('applications')
      .update({ cover_letter_path: path, cover_letter_name: 'test.pdf' })
      .eq('id', id);

    // Signed in without the form: this test is about what a delete leaves
    // behind, and sign-in has its own suite and its own budget (e2e/session.ts).
    await startSignedIn(page, await apiSession('dev-d@example.test'));
    await page.goto(`/applications/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible();

    await page.getByRole('button', { name: 'Delete application' }).click();
    await expect(page.getByText(`Delete your application to ${company}?`)).toBeVisible();
    await expect(page.getByText(/This also deletes 1 note and 1 attached file/)).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete application' }).click();

    await expect(page).toHaveURL(/\/applications$/);
    await expect(page.getByText('Application deleted.')).toBeVisible();

    const { data: gone } = await d.from('applications').select('id').eq('id', id);
    expect(gone ?? [], 'the application itself survived the delete').toEqual([]);

    const { data: notes } = await d.from('notes').select('id').eq('application_id', id);
    expect(notes ?? []).toEqual([]);

    const { data: history } = await d.from('status_history').select('id').eq('application_id', id);
    expect(history ?? []).toEqual([]);

    const { data: files } = await d.storage.from('cover-letters').list(userId);
    expect((files ?? []).some((f) => path.endsWith(`/${f.name}`))).toBe(false);
  });
});

test.describe('7.8.1 cross-user isolation — cover letters (§6 step 3)', () => {
  /**
   * The path on a row is only text: nothing stops user B writing user A's path
   * into B's own application. What must stop B is Storage, whatever the row
   * says — no signed URL, no download, no size, no listing, no delete.
   *
   * Owner dev-d, whose uploads no photo test counts; one stored file per run.
   */
  test.skip(({ browserName }) => browserName !== 'chromium', 'API-only; runs once');

  test('user B cannot sign, read, list, or delete user A cover letter, even through a row pointing at it', async () => {
    const d = await signIn('dev-d@example.test');
    const { data: owner } = await d.auth.getUser();
    const ownerId = owner.user!.id;
    const path = await uploadThroughFunction(d, 'cover-letter', '%PDF-1.4 private');
    expect(path.startsWith(`${ownerId}/`)).toBe(true);

    const b = await signIn('dev-b@example.test');
    const { data: created, error: createError } = await b.rpc('create_application', {
      p_date_applied: '2026-09-10T00:00:00.000Z',
      p_company: `Pointer ${crypto.randomUUID().slice(0, 8)}`,
      p_position: 'Tester',
      p_status: 'Applied',
      p_referral: false,
    });
    expect(createError).toBeNull();
    const bApplication = (created as { id: string }).id;

    try {
      const letters = b.storage.from('cover-letters');

      const { data: signed, error: signError } = await letters.createSignedUrl(path, 60);
      expect(signed).toBeNull();
      expect(signError).not.toBeNull();

      const { data: downloaded } = await letters.download(path);
      expect(downloaded).toBeNull();

      const { data: info } = await letters.info(path);
      expect(info).toBeNull();

      const { data: listed } = await letters.list(ownerId);
      expect(listed ?? []).toEqual([]);

      // B's own row, pointed at A's file: allowed as text, useless as access.
      const { error: pointError } = await b
        .from('applications')
        .update({ cover_letter_path: path, cover_letter_name: 'not mine.pdf' })
        .eq('id', bApplication);
      expect(pointError).toBeNull();
      const { data: stillSigned } = await letters.createSignedUrl(path, 60);
      expect(stillSigned).toBeNull();

      // Deleting B's application removes "its" file as B — which Storage refuses.
      const { data: removed } = await letters.remove([path]);
      expect(removed ?? []).toEqual([]);

      const { data: stillThere } = await d.storage.from('cover-letters').list(ownerId, { search: path.split('/').pop()! });
      expect((stillThere ?? []).some((f) => path.endsWith(f.name))).toBe(true);
    } finally {
      await b.from('applications').delete().eq('id', bApplication);
      await d.storage.from('cover-letters').remove([path]);
    }
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
