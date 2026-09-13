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
const listApplicationStatuses = vi.fn();
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
  listApplicationStatuses: (...args: unknown[]) => listApplicationStatuses(...args),
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

/** The card for a stat, found by its label. */
function card(label: string) {
  return within(screen.getByText(label, { selector: 'dt' }).parentElement!);
}

beforeEach(() => {
  listApplicationStatuses.mockReset();
  listStatusHistory.mockReset();
});

describe('StatsScreen', () => {
  it('shows skeleton bars and says it is loading', async () => {
    listApplicationStatuses.mockReturnValue(new Promise(() => {}));
    listStatusHistory.mockResolvedValue([]);
    renderStats();
    expect(await screen.findByText('Loading your stats')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Your Stats' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Nothing to chart yet' })).toBeNull();
  });

  it('shows the empty state for no applications — no cards, no bar, no NaN', async () => {
    listApplicationStatuses.mockResolvedValue([]);
    listStatusHistory.mockResolvedValue([]);
    const { container } = renderStats();
    expect(await screen.findByRole('heading', { name: 'Nothing to chart yet' })).toBeTruthy();
    expect(screen.getByText('Add your first application to see stats.')).toBeTruthy();
    expect(container.querySelector('dl')).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('says stats failed, with a reference and never the raw message, and Retry recovers', async () => {
    listApplicationStatuses.mockResolvedValue([{ id: 'a0000000-0000-0000-0000-000000000001', status: 'Applied' }]);
    listStatusHistory
      .mockRejectedValueOnce(Object.assign(new Error('permission denied for table status_history'), { code: '42501' }))
      .mockResolvedValueOnce([]);
    const { user } = renderStats();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load stats.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(alert.textContent).not.toContain('permission');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Interviewed', { selector: 'dt' })).toBeTruthy();
  });

  it('counts how far each application got, and breaks down by current status', async () => {
    listApplicationStatuses.mockResolvedValue([
      { id: 'a0000000-0000-0000-0000-000000000001', status: 'Rejected' },
      { id: 'a0000000-0000-0000-0000-000000000002', status: 'Offer' },
      { id: 'a0000000-0000-0000-0000-000000000003', status: 'Applied' },
      { id: 'a0000000-0000-0000-0000-000000000004', status: 'Applied' },
    ]);
    listStatusHistory.mockResolvedValue([
      ...changes('a0000000-0000-0000-0000-000000000001', 'Applied', 'Interview', 'Rejected'),
      ...changes('a0000000-0000-0000-0000-000000000002', 'Applied', 'Callback', 'Offer'),
    ]);
    const { container } = renderStats();

    await screen.findByText('Interviewed', { selector: 'dt' });
    expect(screen.getByText('applications').textContent).toBe('4 applications');
    // Interview → Rejected still counts as Interviewed (§4.5).
    expect(card('Interviewed').getByText('2').tagName).toBe('DD');
    expect(card('Interviewed').getByText('50%', { exact: false }).textContent).toBe('50% of applications');
    expect(card('Callbacks').getByText('1')).toBeTruthy();
    expect(card('Offers').getByText('25%', { exact: false })).toBeTruthy();
    expect(card('Heard back').getByText('2')).toBeTruthy();

    // The legend carries every segment as text, in §3 order, with no zero-count statuses (§10.1).
    const legend = screen.getByRole('list', { name: 'Status breakdown' });
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Applied · 2',
      'Offer · 1',
      'Rejected · 1',
    ]);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('reads one application as "1 application"', async () => {
    listApplicationStatuses.mockResolvedValue([{ id: 'a0000000-0000-0000-0000-000000000001', status: 'Withdrawn' }]);
    listStatusHistory.mockResolvedValue([]);
    renderStats();
    await screen.findByText('Heard back', { selector: 'dt' });
    expect(screen.getByText('application').textContent).toBe('1 application');
    expect(card('Heard back').getByText('0%', { exact: false })).toBeTruthy();
  });
});
