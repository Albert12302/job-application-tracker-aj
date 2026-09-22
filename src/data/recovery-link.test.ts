import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a page load makes of its own fragment (SPEC §4.1d).
 *
 * This runs at module load, before anything renders, so each case reloads the
 * module with a different address — which is also the only way to test it.
 * data/auth.ts has no React in it, so a fresh module graph costs nothing here.
 */

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  createRecoveryClient: () => ({}),
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

async function loadWith(fragment: string) {
  window.history.replaceState(null, '', `/reset-password?from=email${fragment}`);
  vi.resetModules();
  return (await import('./auth')).recoveryLink;
}

const TOKENS = 'access_token=header.body.sig&refresh_token=r-token&expires_in=3600&token_type=bearer';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('recoveryLink', () => {
  it('reads the tokens a recovery link arrives with', async () => {
    const link = await loadWith(`#${TOKENS}&type=recovery`);

    expect(link).toEqual({ status: 'ready', accessToken: 'header.body.sig', refreshToken: 'r-token' });
  });

  it('takes them out of the address bar, keeping the path and its search', async () => {
    await loadWith(`#${TOKENS}&type=recovery`);

    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.search).toBe('?from=email');
  });

  it('reads a link Auth refused as spent — used already, or past its 60 minutes (§7.1)', async () => {
    const link = await loadWith(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );

    expect(link).toEqual({ status: 'invalid' });
    expect(window.location.hash).toBe('');
  });

  it('reads a recovery fragment missing its tokens as spent rather than usable', async () => {
    expect(await loadWith('#type=recovery&expires_in=3600')).toEqual({ status: 'invalid' });
    expect(await loadWith(`#access_token=only-one&type=recovery`)).toEqual({ status: 'invalid' });
  });

  it('is `none` for an ordinary page load', async () => {
    expect(await loadWith('')).toEqual({ status: 'none' });
  });

  it('leaves the skip link alone — `#main` is a fragment too (§10.2)', async () => {
    expect(await loadWith('#main')).toEqual({ status: 'none' });
    expect(window.location.hash).toBe('#main');
  });

  it('leaves a fragment that is a query but not an auth answer where it is', async () => {
    expect(await loadWith('#section=notes')).toEqual({ status: 'none' });
    expect(window.location.hash).toBe('#section=notes');
  });

  it('never writes the link to storage — the app keeps no session from it (§4.1d)', async () => {
    await loadWith(`#${TOKENS}&type=recovery`);

    expect(localStorage.getItem('aj-hunt-auth')).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
