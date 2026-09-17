import { expect, test } from '@playwright/test';
import { expectAxeClean, settled } from './a11y.js';
import { startSignedIn } from './session.js';
import { adminClient, createThrowawayUser, removeThrowawayUser, type ThrowawayUser } from './throwaway-user.js';

/**
 * Account deletion (SPEC §9.7), end to end and for real: the dialog, the
 * Storage deletes, the edge function, the cascade, and the record that outlives
 * all of it.
 *
 * Each test destroys the account it runs as, so each gets a throwaway user of
 * its own (e2e/throwaway-user.ts) rather than a seed user that would be there
 * only once.
 */

test.describe('deleting an account', () => {
  let user: ThrowawayUser;

  test.beforeEach(async ({ page }, testInfo) => {
    user = await createThrowawayUser(testInfo.project.name);
    await startSignedIn(page, user.session);
  });

  test.afterEach(async () => {
    await removeThrowawayUser(user.id);
  });

  test('takes the files, then the account, then everything the cascade owns', async ({ page }) => {
    const admin = adminClient();

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/Deletes 1 application, 1 note, 2 files, and this account/)).toBeVisible();

    // Typed confirmation, not a button (§9.7).
    const confirm = dialog.getByRole('button', { name: 'Delete my account' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Type your email address to confirm').fill(user.email);
    await expect(confirm).toBeEnabled();

    await confirm.click();

    // Returns to sign-in and says what happened (§9.7).
    await expect(page).toHaveURL(/\/sign-in\?.*deleted=true/);
    await expect(page.getByRole('status')).toHaveText('Your account and data have been deleted.');

    // The account itself.
    const { data: gone } = await admin.auth.admin.getUserById(user.id);
    expect(gone.user, 'the auth.users row should be gone').toBeNull();

    // Everything the cascade owns, by the column that actually names the owner.
    for (const table of ['applications', 'saved_filters']) {
      const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      expect(count, `${table} should have no rows left`).toBe(0);
    }
    const { count: profiles } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('id', user.id);
    expect(profiles, 'the profile should be gone').toBe(0);

    // Notes and history carry no user_id — they go with their application (§9.2).
    for (const table of ['notes', 'status_history']) {
      const { count } = await admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('application_id', user.applicationId);
      expect(count, `${table} should have gone with the application`).toBe(0);
    }

    // Storage does not cascade — §9.7's whole reason for deleting files first.
    for (const bucket of ['cover-letters', 'avatars']) {
      const { data: left } = await admin.storage.from(bucket).list(user.id);
      expect(left ?? [], `${bucket} should hold nothing for this user`).toHaveLength(0);
    }

    // The one record that survives, still naming who it was about (§9.7).
    const { data: events } = await admin
      .from('security_events')
      .select('event_type, outcome, user_id')
      .eq('user_id', user.id)
      .eq('event_type', 'account_deletion');
    expect(events).toEqual([{ event_type: 'account_deletion', outcome: 'success', user_id: user.id }]);
  });

  test('offers the export from inside the dialog, and it works (§9.8)', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Export my data first')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export my data' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    // Offering the way out must not have taken it: the account is still here.
    await expect(dialog.getByRole('button', { name: 'Delete my account' })).toBeDisabled();
    const { data: still } = await adminClient().auth.admin.getUserById(user.id);
    expect(still.user?.id).toBe(user.id);
  });

  test('is operable from the keyboard alone, and clean to axe with the dialog open (§10.2, §10.5)', async ({
    page,
  }) => {
    await page.goto('/profile');

    // Opened from the keyboard, so focus lands inside and stays there (§10.2).
    const trigger = page.getByRole('button', { name: 'Delete my account' });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Deletes 1 application/)).toBeVisible();

    await expectAxeClean(page);

    // Typing the address and confirming, without ever reaching for a mouse.
    const field = dialog.getByLabel('Type your email address to confirm');
    await field.focus();
    await page.keyboard.type(user.email);
    await expect(dialog.getByRole('button', { name: 'Delete my account' })).toBeEnabled();
  });

  test('360px: the dialog fits, and every control clears 44px (§11)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/profile');

    for (const name of ['Export my data', 'Delete my account']) {
      expect((await page.getByRole('button', { name }).boundingBox())?.height, name).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole('button', { name: 'Delete my account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // The controls inside count too, and they come from the primitive, not from
    // here — measured rather than read off the class list, because a generated
    // class with an attribute selector outranks one a caller passes (CLAUDE.md).
    // Once it has finished zooming in: mid-animation, 44px measures 41.8.
    await settled(page);
    for (const name of ['Export my data', 'Keep my account', 'Delete my account']) {
      expect((await dialog.getByRole('button', { name }).boundingBox())?.height, name).toBeGreaterThanOrEqual(44);
    }
    const field = dialog.getByLabel('Type your email address to confirm');
    expect((await field.boundingBox())?.height, 'confirm field').toBeGreaterThanOrEqual(44);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('Escape closes the dialog and deletes nothing', async ({ page }) => {
    await page.goto('/profile');
    const trigger = page.getByRole('button', { name: 'Delete my account' });
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Type your email address to confirm').fill(user.email);
    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    const { data: still } = await adminClient().auth.admin.getUserById(user.id);
    expect(still.user?.id).toBe(user.id);
  });
});

/**
 * §7.9 item 12: the cross-user check. The function takes no id, so the only way
 * to aim it at someone else is to try — with a body, and with no token at all.
 */
test.describe('the delete-account function answers only for its own caller', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'a function check; one browser is enough');

  const url = () => `${process.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
  const anon = () => process.env.VITE_SUPABASE_ANON_KEY!;

  test('a body naming another user is ignored; the caller goes, the victim stays', async () => {
    const caller = await createThrowawayUser('caller');
    const victim = await createThrowawayUser('victim');

    try {
      const response = await fetch(url(), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${caller.token}`,
          apikey: anon(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ user_id: victim.id, userId: victim.id }),
      });
      expect(response.status).toBe(204);

      const admin = adminClient();
      expect((await admin.auth.admin.getUserById(caller.id)).data.user, 'the caller should be gone').toBeNull();
      expect((await admin.auth.admin.getUserById(victim.id)).data.user?.id, 'the named user must survive').toBe(
        victim.id,
      );
    } finally {
      await removeThrowawayUser(caller.id);
      await removeThrowawayUser(victim.id);
    }
  });

  test('no token deletes nothing', async () => {
    const response = await fetch(url(), {
      method: 'POST',
      headers: { apikey: anon(), 'content-type': 'application/json' },
      body: '{}',
    });
    // The gateway's verify_jwt refuses it before the function is even reached.
    expect([401, 403]).toContain(response.status);
  });
});
