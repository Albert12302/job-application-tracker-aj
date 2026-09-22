import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordScreen } from './ResetPasswordScreen';

/**
 * Which of §4.1d's three states the screen lands in, decided by what the page
 * load arrived with. The form itself is pinned in ResetPasswordForm.test.tsx;
 * what matters here is that neither dead end is one (§8.1).
 */
const status = vi.hoisted(() => ({ value: 'none' as 'ready' | 'invalid' | 'none' }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/data/auth', () => ({
  get recoveryLink() {
    return { status: status.value, accessToken: 'access', refreshToken: 'refresh' };
  },
}));

vi.mock('@/queries/use-mutations', () => ({
  useResetPassword: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null, submittedAt: 0 }),
  PasswordResetError: class extends Error {},
}));

function renderAt(value: typeof status.value) {
  status.value = value;
  return render(<ResetPasswordScreen />);
}

describe('ResetPasswordScreen', () => {
  it('shows the form when the link is good', () => {
    renderAt('ready');
    expect(screen.getByLabelText('New password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeTruthy();
  });

  it('says a spent link is spent, and offers another — never the form', () => {
    renderAt('invalid');
    expect(screen.getByText('That reset link has expired or has already been used.')).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe('/forgot-password');
  });

  it('tells someone who typed the address what to do instead', () => {
    renderAt('none');
    expect(screen.getByText('Open the link in your password reset email to set a new password.')).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/sign-in');
  });

  it.each(['ready', 'invalid', 'none'] as const)('has no axe violations when %s', async (value) => {
    const { container } = renderAt(value);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
