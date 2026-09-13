import { describe, expect, it, vi } from 'vitest';
import { allPages, PAGE_SIZE } from './all-pages';

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i);

describe('allPages', () => {
  it('reads one short page and stops', async () => {
    const page = vi.fn(async () => ({ data: rows(3), error: null }));
    expect(await allPages(page)).toEqual([0, 1, 2]);
    expect(page).toHaveBeenCalledExactlyOnceWith(0, PAGE_SIZE - 1);
  });

  it('keeps reading past full pages, so a large set is never cut at max_rows', async () => {
    const pages = [rows(PAGE_SIZE), rows(PAGE_SIZE, PAGE_SIZE), rows(5, 2 * PAGE_SIZE)];
    const page = vi.fn(async (from: number) => ({ data: pages[from / PAGE_SIZE]!, error: null }));
    const all = await allPages(page);
    expect(all).toHaveLength(2 * PAGE_SIZE + 5);
    expect(page.mock.calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
      [2 * PAGE_SIZE, 3 * PAGE_SIZE - 1],
    ]);
  });

  it('asks once more after an exactly full page, and stops on the empty one', async () => {
    const page = vi.fn(async (from: number) => ({ data: from === 0 ? rows(PAGE_SIZE) : [], error: null }));
    expect(await allPages(page)).toHaveLength(PAGE_SIZE);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('fails the whole read when any page fails, rather than returning part of the set', async () => {
    const failure = { code: '57014' };
    const page = vi.fn(async (from: number) => (from === 0 ? { data: rows(PAGE_SIZE), error: null } : { data: null, error: failure }));
    await expect(allPages(page)).rejects.toBe(failure);
  });
});
