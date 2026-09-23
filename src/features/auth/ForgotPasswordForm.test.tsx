import { AuthError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/**
 * The real form, mutation, and data/auth.ts mapping — only the Supabase client
 * underneath is a stub. What these pin is §4.1c's one promise: the screen's
 * answer does not depend on the address (§7.1, no account enumeration).
 */
const resetPasswordForEmail = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  createRecoveryClient: () => ({}),
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

/**
 * auth-js's `AuthRetryableFetchError` as it actually arrives. It matters that
 * this is exact: a dropped connection carries `status: 0` — a *number* — so a
 * guard asking "does it have a numeric status?" treats it as an answer from
 * Auth and shows the confirmation for an email nobody sent. An earlier version
 * of this test fabricated an `AuthError` with no status, a shape auth-js never
 * produces, and passed against exactly that bug.
 */
function unanswered(status: number): AuthError {
  const error = new AuthError('Failed to fetch', status);
  error.name = 'AuthRetryableFetchError';
  return error;
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSent = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <ForgotPasswordForm onSent={onSent} />
    </QueryClientProvider>,
  );
  return { ...view, onSent, user: userEvent.setup() };
}

async function submit(user: ReturnType<typeof userEvent.setup>, email: string) {
  if (email) await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
}

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

describe('ForgotPasswordForm', () => {
  it('needs something that could be an address, and asks Auth nothing until it has one', async () => {
    const { user } = renderForm();
    await submit(user, 'not an email');

    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid email address.');
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('sends the link back to the reset screen, so the email lands where the form is', async () => {
    const { user, onSent } = renderForm();
    await submit(user, 'dev-a@example.test');

    await vi.waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(resetPasswordForEmail).toHaveBeenCalledWith('dev-a@example.test', {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  });

  it.each([
    ['an address with an account', { data: {}, error: null }],
    // Auth answers a request for an unknown address exactly as it answers a
    // known one, and §7.1 requires this screen to do the same.
    ['an address without one', { data: {}, error: null }],
    // §7.1: "Password reset, per email 3/hour → silently succeed, send nothing".
    [
      "an address over Auth's send limit",
      { data: null, error: new AuthError('rate limited', 429, 'over_email_send_rate_limit') },
    ],
  ])('advances to the same confirmation for %s', async (_label, response) => {
    resetPasswordForEmail.mockResolvedValue(response);
    const { user, onSent } = renderForm();
    await submit(user, 'someone@example.test');

    await vi.waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['a dropped connection', 0],
    ['a gateway that would not talk', 503],
  ])('says so for %s, and stays on the form', async (_label, status) => {
    // Auth never answered, so nothing was learned about the address and a
    // confirmation would be a lie.
    resetPasswordForEmail.mockResolvedValue({ data: null, error: unanswered(status) });
    const { user, onSent } = renderForm();
    await submit(user, 'dev-a@example.test');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(
      /^Couldn't send the link\. Check your connection and try again\. Error reference [0-9a-f]{8}\.$/,
    );
    expect(onSent).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'dev-a@example.test');
  });

  it('disables the form and says so while sending', async () => {
    let resolve: (value: unknown) => void = () => {};
    resetPasswordForEmail.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = renderForm();
    await submit(user, 'dev-a@example.test');

    // :disabled, not .disabled — the property ignores the disabled fieldset around a control.
    const button = await screen.findByRole('button', { name: 'Sending…' });
    expect(button.matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Email').matches(':disabled')).toBe(true);
    resolve({ data: {}, error: null });
  });

  it('has no axe violations, including with an error showing', async () => {
    const { user, container } = renderForm();
    expect((await axe.run(container)).violations).toEqual([]);
    await submit(user, 'not an email');
    await screen.findByRole('alert');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
