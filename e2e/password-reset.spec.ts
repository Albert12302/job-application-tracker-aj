import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { expectAxeClean } from './a11y.js';
import { resetLinkFor, SPENT_LINK_FRAGMENT, throwawayEmail } from './mailbox.js';
import { STORAGE_KEY } from './session.js';
import { createBareUser, removeThrowawayUser } from './throwaway-user.js';

/**
 * SPEC §4.1c–d end to end: ask for a link, open the one that arrives, set a
 * password, and come back to sign in with it.
 *
 * It runs as a user of its own, created and destroyed here. It has to: the test
 * changes the password it signs in with, and every other suite signs its seed
 * user in with `devpassword1234`.
 *
 * **One email per browser project per run** — `config.toml` allows 10 an hour
 * and one per address per minute, shared by everything local (see mailbox.ts).
 * Every failure state below is reached by visiting the fragment Auth would have
 * sent, which costs nothing and is the same input the app parses.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

const OLD_PASSWORD = 'devpassword1234';
const NEW_PASSWORD = 'a new passphrase for the probe';

test('a reset link sets a new password and comes back to sign in with it', async ({ page, browserName }) => {
  const email = throwawayEmail(browserName);
  const id = await createBareUser(email, OLD_PASSWORD);

  try {
    await page.goto('/sign-in');
    await page.getByRole('link', { name: 'Forgot password' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    // §4.1c: the same sentence whatever the address turns out to be.
    await expect(
      page.getByText("If that email has an account, we've sent a link to reset the password.", { exact: true }),
    ).toBeVisible();
    await expectAxeClean(page);

    // The link as the person in the email gets it — Auth's verify URL, which
    // redirects to the app with the session in the fragment.
    await page.goto(await resetLinkFor(email));
    await expect(page).toHaveURL(/\/reset-password$/);

    // §4.1d, the whole point of the design: the link carries a real session and
    // the app takes none of it. Nothing in storage, and nothing in the address
    // bar for the next person at this browser to read out of history.
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();
    expect(new URL(page.url()).hash).toBe('');

    await expect(page.getByText('Saving this signs out every other device.')).toBeVisible();
    await expectAxeClean(page);

    // `exact`, always: "New password" is a substring of "Confirm new password",
    // and a label match is a case-insensitive substring match.
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save new password' }).click();

    // Back to sign in, not into the app (§4.1d).
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)).toBeNull();

    // The new password is the account's, through the form and the sign-in
    // function, exactly as a person would use it.
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/applications/);

    // And the old one is not. Asked of Auth directly rather than through the
    // form: a deliberate failure at the form would spend §7.1's per-address
    // budget on an assertion that is about the password, not the limit.
    const client = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: OLD_PASSWORD });
    expect(error, 'the old password still works after a reset').not.toBeNull();
  } finally {
    await removeThrowawayUser(id);
  }
});

test('an address with no account gets the same answer as one that has (§7.1)', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(`nobody-${crypto.randomUUID()}@example.test`);
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(
    page.getByText("If that email has an account, we've sent a link to reset the password.", { exact: true }),
  ).toBeVisible();
  // Nothing on screen distinguishes it — no error, and no form to retry from.
  expect(await page.getByRole('alert').count()).toBe(0);
  expect(await page.getByLabel('Email').count()).toBe(0);
});

test('a spent link says so and offers another, instead of a form that cannot work', async ({ page }) => {
  await page.goto(`/reset-password${SPENT_LINK_FRAGMENT}`);

  await expect(page.getByText('That reset link has expired or has already been used.')).toBeVisible();
  expect(await page.getByLabel('New password', { exact: true }).count()).toBe(0);
  // §8.1: never a dead end. And the fragment goes, spent or not.
  expect(new URL(page.url()).hash).toBe('');
  await expectAxeClean(page);

  await page.getByRole('link', { name: 'Request a new link' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test('the reset address on its own explains where the link comes from', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByText('Open the link in your password reset email to set a new password.')).toBeVisible();
  expect(await page.getByLabel('New password', { exact: true }).count()).toBe(0);
  await page.getByRole('link', { name: 'Back to sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('the skip link still works on the reset screen — its fragment is not an auth answer', async ({ page }) => {
  await page.goto('/reset-password#main');

  expect(new URL(page.url()).hash).toBe('#main');
});
