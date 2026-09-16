import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusChange } from '@/domain/schemas';
import type { Status } from '@/domain/status';
import { renderRoutes } from '@/test/render-routes';
import { StatsScreen } from './StatsScreen';

/**
 * The real screen, query, and error reporting — only the two reads are stubs.
 * The counting rules themselves are domain/stats.test.ts's; these assert what
 * the user sees in each §8.2 state.
 */
const listStatsApplications = vi.fn();
const listStatusHistory = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => ({ id: '11111111-1111-1111-1111-111111111111', email: 'dev-a@example.test' }),
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));

vi.mock('@/data/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/applications')>()),
  listStatsApplications: (...args: unknown[]) => listStatsApplications(...args),
}));

vi.mock('@/data/status-history', () => ({
  listStatusHistory: (...args: unknown[]) => listStatusHistory(...args),
}));

const renderStats = () => renderRoutes({ '/stats': StatsScreen }, '/stats');

function changes(id: string, ...statuses: Status[]): StatusChange[] {
  return statuses.map((to_status, minute) => ({
    application_id: id,
    to_status,
    changed_at: `2026-09-01T12:0${minute}:00+00:00`,
  }));
}

/** A stat's figure, found by its card's label. */
function figure(label: string) {
  return screen.getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')!.textContent;
}

const A1 = 'a0000000-0000-0000-0000-000000000001';
const A2 = 'a0000000-0000-0000-0000-000000000002';
const A3 = 'a0000000-0000-0000-0000-000000000003';
const A4 = 'a0000000-0000-0000-0000-000000000004';

beforeEach(() => {
  listStatsApplications.mockReset();
  listStatusHistory.mockReset();
});

describe('StatsScreen', () => {
  it('shows skeleton bars and says it is loading', async () => {
    listStatsApplications.mockReturnValue(new Promise(() => {}));
    listStatusHistory.mockResolvedValue([]);
    renderStats();
    expect(await screen.findByText('Loading your stats')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Your Stats' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Nothing to chart yet' })).toBeNull();
  });

  it('shows the empty state for no applications — no cards, no bar, no NaN', async () => {
    listStatsApplications.mockResolvedValue([]);
    listStatusHistory.mockResolvedValue([]);
    const { container } = renderStats();
    expect(await screen.findByRole('heading', { name: 'Nothing to chart yet' })).toBeTruthy();
    expect(screen.getByText('Add your first application to see stats.')).toBeTruthy();
    expect(container.querySelector('dl')).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('says stats failed, with a reference and never the raw message, and Retry recovers', async () => {
    listStatsApplications.mockResolvedValue([{ id: A1, status: 'Applied', referral: false }]);
    listStatusHistory
      .mockRejectedValueOnce(Object.assign(new Error('permission denied for table status_history'), { code: '42501' }))
      .mockResolvedValueOnce([]);
    const { user } = renderStats();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load stats.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(alert.textContent).not.toContain('permission');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Applications', { selector: 'dt' })).toBeTruthy();
  });

  it('shows the prototype’s two rows, counting how far each application got', async () => {
    listStatsApplications.mockResolvedValue([
      { id: A1, status: 'Rejected', referral: true },
      { id: A2, status: 'Offer', referral: false },
      { id: A3, status: 'Applied', referral: false },
      { id: A4, status: 'Applied', referral: false },
    ]);
    listStatusHistory.mockResolvedValue([
      ...changes(A1, 'Applied', 'Interview', 'Rejected'),
      ...changes(A2, 'Applied', 'Callback', 'Offer'),
    ]);
    const { container } = renderStats();

    await screen.findByText('Applications', { selector: 'dt' });
    const [counts, rates] = [...container.querySelectorAll('dl')];
    expect([...counts!.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Applications',
      'Interviews',
      'Callbacks',
      'Via referral',
    ]);
    expect([...rates!.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Heard back',
      'Interview rate',
      'Callback rate',
      'Offer rate',
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'How far applications got' })).toBeTruthy();

    expect(figure('Applications')).toBe('4');
    // Interview → Rejected still counts as an interview (§4.5).
    expect(figure('Interviews')).toBe('2');
    expect(figure('Callbacks')).toBe('1');
    expect(figure('Via referral')).toBe('25%');
    expect(figure('Heard back')).toBe('50%');
    expect(figure('Interview rate')).toBe('50%');
    expect(figure('Callback rate')).toBe('25%');
    expect(figure('Offer rate')).toBe('25%');

    // The legend carries every segment as text, in §3 order, with no zero-count statuses (§10.1).
    const legend = screen.getByRole('list', { name: 'Status breakdown' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Applied · 2',
      'Offer · 1',
      'Rejected · 1',
    ]);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
