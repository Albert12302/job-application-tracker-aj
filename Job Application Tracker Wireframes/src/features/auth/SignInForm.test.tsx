import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from './SignInForm';

/**
 * The real form, mutation, and data/auth.ts mapping — only the Supabase client
 * underneath is a stub. So these assert the whole client half of the sign-in
 * contract: status code in, SPEC copy out.
 */
const invoke = vi.fn();
const setSession = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: {
      setSession: (...args: unknown[]) => setSession(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ insert: async () => ({ error: null }) }),
  },
}));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SignInForm />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

const httpError = (status: number) => ({ data: null, error: new FunctionsHttpError(new Response(null, { status })) });

async function submit(user: ReturnType<typeof userEvent.setup>, email = 'dev-a@example.test', password = 'devpassword1234') {
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  invoke.mockReset();
  setSession.mockReset();
});

describe('SignInForm', () => {
  it('shows the SPEC copy once for an empty submit, and calls nothing', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Enter an email and password.');
    expect(screen.getAllByText('Enter an email and password.')).toHaveLength(1);
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe('sign-in-error');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('flags only the empty field', async () => {
    const { user } = renderForm();
    await submit(user, 'dev-a@example.test', '');
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
  });

  it('calls the sign-in edge function, never Auth directly, then stores the session', async () => {
    invoke.mockResolvedValue({ data: { session: { access_token: 'a', refresh_token: 'r' } }, error: null });
    setSession.mockResolvedValue({ error: null });
    const { user } = renderForm();
    await submit(user);

    await vi.waitFor(() => expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' }));
    expect(invoke).toHaveBeenCalledWith('sign-in', {
      body: { email: 'dev-a@example.test', password: 'devpassword1234' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows one generic message for bad credentials and keeps what was typed', async () => {
    invoke.mockResolvedValue(httpError(401));
    const { user } = renderForm();
    await submit(user, 'nobody@example.test', 'wrong password');

    expect((await screen.findByRole('alert')).textContent).toBe('That email and password combination is incorrect.');
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'nobody@example.test');
    expect(screen.getByLabelText('Password')).toHaveProperty('value', 'wrong password');
  });

  it('explains a lockout with the wait the function gave', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'Too many attempts.', retryAfterMinutes: 42 }), { status: 429 }),
      ),
    });
    const { user } = renderForm();
    await submit(user);
    expect((await screen.findByRole('alert')).textContent).toBe('Too many attempts. Try again in about 42 minutes.');
  });

  it('says "later" when a lockout arrives without a usable wait', async () => {
    invoke.mockResolvedValue(httpError(429));
    const { user } = renderForm();
    await submit(user);
    expect((await screen.findByRole('alert')).textContent).toBe('Too many attempts. Try again later.');
  });

  it.each([
    ['a network failure', { data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) }],
    ['a server error', httpError(503)],
    ['a malformed success body', { data: { session: {} }, error: null }],
  ])('treats %s as unavailable, with an error reference', async (_label, response) => {
    invoke.mockResolvedValue(response);
    const { user } = renderForm();
    await submit(user);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/^Couldn't sign you in\. Check your connection and try again\. Error reference [0-9a-f]{8}\.$/);
    expect(setSession).not.toHaveBeenCalled();
  });

  it('disables the form and says so while signing in', async () => {
    let resolve: (value: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = renderForm();
    await submit(user);

    // :disabled, not .disabled — the property ignores the disabled fieldset around a control.
    const button = await screen.findByRole('button', { name: 'Signing in…' });
    expect(button.matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Email').matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Password').matches(':disabled')).toBe(true);
    resolve(httpError(401));
    await screen.findByRole('button', { name: 'Sign in' });
  });

  it('has no axe violations, including with an error showing', async () => {
    invoke.mockResolvedValue(httpError(401));
    const { user, container } = renderForm();
    expect((await axe.run(container)).violations).toEqual([]);
    await submit(user);
    await screen.findByRole('alert');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
