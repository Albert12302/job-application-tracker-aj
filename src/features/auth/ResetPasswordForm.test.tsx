import { AuthError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './ResetPasswordForm';

/**
 * The real form, mutation, and data/auth.ts mapping; the recovery link is a
 * fixed one (its parsing is pinned in data/recovery-link.test.ts) and the
 * Supabase clients underneath are stubs.
 *
 * What these hold is §4.1d's shape: the link's session is used for this one
 * request and then spent, the app's own session is never written, and every
 * outcome the user can act on says what to do about it.
 */
const setSession = vi.fn();
const updateUser = vi.fn();
const revoke = vi.fn();
const insertEvent = vi.fn();
const navigate = vi.fn();
const order: string[] = [];

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

vi.mock('@/data/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/auth')>()),
  // Inline, not a shared const: vi.mock factories are hoisted above every
  // declaration in the file.
  recoveryLink: { status: 'ready', accessToken: 'access', refreshToken: 'refresh' },
}));

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  createRecoveryClient: () => ({
    auth: {
      setSession: (...args: unknown[]) => setSession(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
      signOut: (...args: unknown[]) => {
        order.push('sign-out');
        return revoke(...args);
      },
    },
    from: () => ({
      insert: (...args: unknown[]) => {
        order.push('security-event');
        return insertEvent(...args);
      },
    }),
  }),
  // The app's own client. Nothing in this flow may reach it, and these throws
  // are how we would find out if it ever did.
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      updateUser: () => {
        throw new Error('the reset must never touch the app session');
      },
    },
    from: () => {
      throw new Error('the reset must never write as the app session');
    },
  },
}));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ResetPasswordForm />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

const GOOD = 'correct horse battery';

async function submit(user: ReturnType<typeof userEvent.setup>, password = GOOD, confirm = password) {
  if (password) await user.type(screen.getByLabelText('New password'), password);
  if (confirm) await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Save new password' }));
}

beforeEach(() => {
  order.length = 0;
  for (const mock of [setSession, updateUser, revoke, insertEvent, navigate]) mock.mockReset();
  setSession.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
  revoke.mockResolvedValue({ error: null });
  insertEvent.mockResolvedValue({ error: null });
});

describe('ResetPasswordForm', () => {
  it('holds the §7.1 policy before asking Auth anything', async () => {
    const { user } = renderForm();
    await submit(user, 'short', 'short');

    expect((await screen.findByRole('alert')).textContent).toBe('Password must be at least 12 characters.');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('names a mismatch on the field that has to change', async () => {
    const { user } = renderForm();
    await submit(user, GOOD, 'correct horse');

    expect((await screen.findByRole('alert')).textContent).toBe("Those passwords don't match.");
    expect(screen.getByLabelText('Confirm new password').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('New password').getAttribute('aria-invalid')).toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('spends the link on the password, logs it, ends every session, and returns to sign-in', async () => {
    const { user } = renderForm();
    await submit(user);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' });
    expect(updateUser).toHaveBeenCalledWith({ password: GOOD });
    expect(insertEvent).toHaveBeenCalledWith({ event_type: 'password_reset_complete', outcome: 'success' });
    // §4.1d: every other device, not just this one.
    expect(revoke).toHaveBeenCalledWith({ scope: 'global' });
    // The row is written while there is still a session to attribute it to (§7.7).
    expect(order).toEqual(['security-event', 'sign-out']);
    expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', search: { reset: true }, replace: true });
  });

  it('still finishes when the log will not write — the password has already changed', async () => {
    insertEvent.mockResolvedValue({ error: new Error('refused') });
    const { user } = renderForm();
    await submit(user);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(revoke).toHaveBeenCalled();
  });

  it('still finishes when the sessions could not be revoked, rather than claiming the reset failed', async () => {
    revoke.mockRejectedValue(new Error('offline'));
    const { user } = renderForm();
    await submit(user);

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['a link refused at the session', () => setSession.mockResolvedValue({ error: new AuthError('bad', 401) })],
    [
      'a link spent between opening and saving',
      () => updateUser.mockResolvedValue({ error: new AuthError('expired', 401, 'session_expired') }),
    ],
    [
      // auth-js raises this itself when the session has gone: no code, and a
      // 400 rather than a 401, so only its name tells you what happened.
      'a session that vanished under the form',
      () => {
        const error = new AuthError('Auth session missing!', 400);
        error.name = 'AuthSessionMissingError';
        updateUser.mockResolvedValue({ error });
      },
    ],
  ])('offers a new link for %s, without an error reference', async (_label, arrange) => {
    arrange();
    const { user } = renderForm();
    await submit(user);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That reset link has expired or has already been used. Request a new one to try again.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says what to do about a password Auth itself refuses', async () => {
    updateUser.mockResolvedValue({ error: new AuthError('same', 422, 'same_password') });
    const { user } = renderForm();
    await submit(user);

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Choose a password you haven't used for this account before.",
    );
  });

  it('reports anything else, keeps what was typed, and shows the reference', async () => {
    updateUser.mockResolvedValue({ error: new AuthError('boom', 503) });
    const { user } = renderForm();
    await submit(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(
      /^Couldn't save your new password\. Check your connection and try again\. Error reference [0-9a-f]{8}\.$/,
    );
    expect(screen.getByLabelText('New password')).toHaveProperty('value', GOOD);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('disables the form and says so while saving', async () => {
    let resolve: (value: unknown) => void = () => {};
    updateUser.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = renderForm();
    await submit(user);

    // :disabled, not .disabled — the property ignores the disabled fieldset around a control.
    const button = await screen.findByRole('button', { name: 'Saving…' });
    expect(button.matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('New password').matches(':disabled')).toBe(true);
    resolve({ error: new AuthError('boom', 503) });
    await screen.findByRole('alert');
  });

  it('has no axe violations, including with an error showing', async () => {
    const { user, container } = renderForm();
    expect((await axe.run(container)).violations).toEqual([]);
    await submit(user, 'short', 'short');
    await screen.findByRole('alert');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
