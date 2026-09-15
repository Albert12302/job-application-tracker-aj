import { describe, expect, it } from 'vitest';
import { pageItems, pageWindow, rangeLabel, spokenRange, type PageItem } from './pagination';

/** Page items as a compact string: "1 2 … 10". */
const show = (items: PageItem[]) => items.map((item) => (item.kind === 'gap' ? '…' : String(item.page))).join(' ');

describe('pageWindow', () => {
  it('slices the page asked for', () => {
    expect(pageWindow(42, 2, 10)).toEqual({ page: 2, pageCount: 5, start: 10, end: 20, total: 42 });
  });

  it('ends the last page at the last row', () => {
    expect(pageWindow(42, 5, 10)).toMatchObject({ start: 40, end: 42 });
  });

  it('shows the last page for a page past the end — a stale link, or its rows deleted', () => {
    expect(pageWindow(42, 40, 10)).toMatchObject({ page: 5, start: 40, end: 42 });
    expect(pageWindow(20, 3, 10)).toMatchObject({ page: 2, start: 10, end: 20 });
  });

  it('counts an exact multiple as full pages, with no empty page after', () => {
    expect(pageWindow(50, 1, 25).pageCount).toBe(2);
  });

  it('treats an empty set as one empty page', () => {
    expect(pageWindow(0, 3, 10)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0, total: 0 });
  });

  it('pulls a page below 1 up to the first', () => {
    expect(pageWindow(42, 0, 10).page).toBe(1);
    expect(pageWindow(42, -3, 10).page).toBe(1);
  });

  it('never repeats or skips a row across the pages', () => {
    const total = 23;
    const seen: number[] = [];
    for (let page = 1; page <= pageWindow(total, 1, 10).pageCount; page++) {
      const { start, end } = pageWindow(total, page, 10);
      for (let row = start; row < end; row++) seen.push(row);
    }
    expect(seen).toEqual(Array.from({ length: total }, (_, row) => row));
  });
});

describe('rangeLabel and spokenRange', () => {
  it('label the rows shown out of the whole filtered set', () => {
    expect(rangeLabel(pageWindow(42, 2, 10))).toBe('11–20 of 42');
    expect(spokenRange(pageWindow(42, 2, 10))).toBe('11 to 20 of 42');
  });

  it('label a single row on the last page without a range', () => {
    expect(rangeLabel(pageWindow(41, 5, 10))).toBe('41 of 41');
    expect(spokenRange(pageWindow(41, 5, 10))).toBe('41 of 41');
  });

  it('label nothing as 0 of 0', () => {
    expect(rangeLabel(pageWindow(0, 1, 10))).toBe('0 of 0');
    expect(spokenRange(pageWindow(0, 1, 10))).toBe('0 of 0');
  });
});

describe('pageItems', () => {
  it('offers every page when there are few', () => {
    expect(show(pageItems(1, 1))).toBe('1');
    expect(show(pageItems(2, 3))).toBe('1 2 3');
    expect(show(pageItems(3, 5))).toBe('1 2 3 4 5');
  });

  it('keeps the first, the last, and the neighbours of the current page', () => {
    expect(show(pageItems(12, 25))).toBe('1 … 11 12 13 … 25');
    expect(show(pageItems(6, 10))).toBe('1 … 5 6 7 … 10');
  });

  it('gives the room near either end to more pages, not a shorter row', () => {
    expect(show(pageItems(1, 25))).toBe('1 2 3 4 5 … 25');
    expect(show(pageItems(4, 25))).toBe('1 2 3 4 5 … 25');
    expect(show(pageItems(5, 25))).toBe('1 … 4 5 6 … 25');
    expect(show(pageItems(21, 25))).toBe('1 … 20 21 22 … 25');
    expect(show(pageItems(22, 25))).toBe('1 … 21 22 23 24 25');
    expect(show(pageItems(25, 25))).toBe('1 … 21 22 23 24 25');
  });

  it('is exactly seven items on every page once there are seven pages or more, so the bar never changes width', () => {
    for (const pageCount of [7, 8, 9, 10, 25, 500]) {
      for (let page = 1; page <= pageCount; page++) {
        expect(pageItems(page, pageCount), `page ${page} of ${pageCount}`).toHaveLength(7);
      }
    }
  });

  it('always shows the first, the last, and the current page, in order, with no page twice', () => {
    for (const pageCount of [1, 2, 6, 7, 8, 25]) {
      for (let page = 1; page <= pageCount; page++) {
        const numbers = pageItems(page, pageCount).flatMap((item) => (item.kind === 'page' ? [item.page] : []));
        expect(numbers).toContain(1);
        expect(numbers).toContain(page);
        expect(numbers.at(-1)).toBe(pageCount);
        expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
      }
    }
  });

  it('never lets a gap stand for a single page', () => {
    for (const pageCount of [8, 9, 10, 25]) {
      for (let page = 1; page <= pageCount; page++) {
        const items = pageItems(page, pageCount);
        items.forEach((item, i) => {
          if (item.kind !== 'gap') return;
          const before = items[i - 1];
          const after = items[i + 1];
          expect(before?.kind === 'page' && after?.kind === 'page' && after.page - before.page).toBeGreaterThanOrEqual(3);
        });
      }
    }
  });

  it('gives each gap a distinct key', () => {
    const gaps = pageItems(6, 10).filter((item) => item.kind === 'gap');
    expect(new Set(gaps.map((gap) => gap.before)).size).toBe(gaps.length);
  });
});
