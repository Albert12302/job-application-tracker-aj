import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

/**
 * §4.1c's second state: the answer, and what happens to focus when it replaces
 * the form. The form's own contract is in ForgotPasswordForm.test.tsx.
 */
const resetPasswordForEmail = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

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

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ForgotPasswordScreen />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

beforeEach(() => {
  resetPasswordForEmail.mockReset();
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

describe('ForgotPasswordScreen', () => {
  it('starts on the form, with a way back to sign in', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/sign-in');
  });

  it('replaces the form with the one answer it ever gives, and moves focus to it', async () => {
    const { user } = renderScreen();
    await user.type(screen.getByLabelText('Email'), 'dev-a@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    const answer = await screen.findByText("If that email has an account, we've sent a link to reset the password.");
    expect(screen.queryByLabelText('Email')).toBeNull();
    // The button it was on has gone; focus follows the answer rather than
    // falling back to the document (§10.2).
    expect(document.activeElement).toBe(answer);
    expect(screen.getByText('Check spam before requesting another. Links expire in 60 minutes.')).toBeTruthy();
  });

  it('has no axe violations in either state', async () => {
    const { user, container } = renderScreen();
    expect((await axe.run(container)).violations).toEqual([]);

    await user.type(screen.getByLabelText('Email'), 'dev-a@example.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    await screen.findByText("If that email has an account, we've sent a link to reset the password.");
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
