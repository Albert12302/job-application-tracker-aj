import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatUtcDate, NUMERIC_DATE } from '@/domain/date';
import { applicationRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { ApplicationsScreen } from './ApplicationsScreen';

/**
 * The real screen, queries, mutations, and error reporting — only the data
 * module's two network calls are stubs. So these assert §8.2's three states
 * and §8.3's rollback as the user meets them.
 */
const listApplications = vi.fn();
const setStarred = vi.fn();

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
  listApplications: (...args: unknown[]) => listApplications(...args),
  setStarred: (...args: unknown[]) => setStarred(...args),
}));

const renderList = () => renderRoutes({ '/applications': ApplicationsScreen }, '/applications');

beforeEach(() => {
  listApplications.mockReset();
  setStarred.mockReset();
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('ApplicationsScreen', () => {
  it('shows skeleton rows and says it is loading', async () => {
    listApplications.mockReturnValue(new Promise(() => {}));
    renderList();
    expect(await screen.findByText('Loading your applications')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'No applications yet' })).toBeNull();
    // The way to add one does not wait for the list.
    expect(screen.getByRole('link', { name: 'Add application' })).toBeTruthy();
  });

  it('explains an empty list and offers the way to fill it', async () => {
    listApplications.mockResolvedValue([]);
    const { container } = renderList();
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Add application' })).toHaveLength(2);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('says the list failed, with a reference and never the raw message, and Retry recovers', async () => {
    listApplications
      .mockRejectedValueOnce(Object.assign(new Error('relation "applications" does not exist'), { code: '42P01' }))
      .mockResolvedValueOnce([applicationRow()]);
    const { user } = renderList();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't load your applications.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(alert.textContent).not.toContain('relation');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Northwind Traders' })).toBeTruthy();
  });

  it('lists each application in its columns, with the date as stored', async () => {
    listApplications.mockResolvedValue([
      applicationRow({
        company: 'Fabrikam',
        status: 'Offer',
        starred: true,
        referral: true,
        location: null,
        cover_letter_path: '11111111-1111-1111-1111-111111111111/f.pdf',
        cover_letter_name: 'cover.pdf',
      }),
    ]);
    const { container } = renderList();

    const row = within((await screen.findByRole('link', { name: 'Fabrikam' })).closest('tr')!);
    // UTC midnight on the 8th reads as the 8th in every zone — never the 7th (§5.4).
    expect(row.getByText(formatUtcDate('2026-08-08T00:00:00Z', NUMERIC_DATE))).toBeTruthy();
    expect(formatUtcDate('2026-08-08T00:00:00Z', NUMERIC_DATE)).toMatch(/8/);
    expect(row.getByText('Offer')).toBeTruthy();
    expect(row.getByRole('button', { name: 'Star Fabrikam' }).getAttribute('aria-pressed')).toBe('true');
    expect(row.getByText('None')).toBeTruthy();
    expect(row.getByText('Attached')).toBeTruthy();
    expect(row.getByText('Yes')).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('stars at once, and puts the star back when the save fails (§8.3)', async () => {
    listApplications.mockResolvedValue([applicationRow({ company: 'Contoso' })]);
    let fail: (reason: unknown) => void = () => {};
    setStarred.mockReturnValue(new Promise((_resolve, reject) => (fail = reject)));
    const { user } = renderList();

    await user.click(await screen.findByRole('button', { name: 'Star Contoso' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Star Contoso' }).getAttribute('aria-pressed')).toBe('true'),
    );
    expect(setStarred).toHaveBeenCalledWith(expect.any(String), true);

    fail(new Error('network'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Star Contoso' }).getAttribute('aria-pressed')).toBe('false'),
    );
  });

  it('opens an application from anywhere on its row, but not from its star', async () => {
    listApplications.mockResolvedValue([applicationRow({ position: 'UI Engineer' })]);
    setStarred.mockResolvedValue(undefined);
    const { user } = renderList();

    await user.click(await screen.findByRole('button', { name: /^Star / }));
    expect(screen.queryByRole('heading', { name: 'Route /applications/$id' })).toBeNull();

    await user.click(screen.getByText('UI Engineer'));
    expect(await screen.findByRole('heading', { name: 'Route /applications/$id' })).toBeTruthy();
  });

  it('shows cards instead of a table below 760px (§11)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }),
    });
    listApplications.mockResolvedValue([applicationRow({ company: 'Litware', referral: true })]);
    const { container } = renderList();

    const list = await screen.findByRole('list', { name: 'Your applications, newest first' });
    expect(within(list).getByRole('link', { name: 'Litware' })).toBeTruthy();
    expect(within(list).getByRole('button', { name: 'Star Litware' })).toBeTruthy();
    expect(within(list).getByText('Referral')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
