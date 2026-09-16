/**
 * Pages of the list (SPEC §4.2). Pure: the list screen hands in how many rows
 * the filter and search let through, and the page and size from the URL, and
 * gets back which slice to show and how to label it. The count is always the
 * whole filtered set, never the page (§5.3).
 */

export const PAGE_SIZES = [10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type PageWindow = {
  /** The page shown: the one asked for, pulled back inside 1…pageCount. */
  page: number;
  pageCount: number;
  /** Index of the first row on the page. */
  start: number;
  /** One past the last row on the page. */
  end: number;
  total: number;
};

/**
 * The slice for `page`. A page past the end — a stale link, or the last rows of
 * the last page deleted — shows the last page rather than nothing, and an empty
 * set is one empty page.
 */
export function pageWindow(total: number, page: number, pageSize: number): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const shown = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (shown - 1) * pageSize;
  return { page: shown, pageCount, start, end: Math.min(start + pageSize, total), total };
}

/** "11–20 of 42" (§4.2); a page holding one row is "41 of 41". */
export function rangeLabel({ start, end, total }: PageWindow): string {
  if (total === 0) return '0 of 0';
  return start + 1 === end ? `${end} of ${total}` : `${start + 1}–${end} of ${total}`;
}

/** The same range as words, for screen readers, which do not all read a dash as "to". */
export function spokenRange({ start, end, total }: PageWindow): string {
  if (total === 0) return '0 of 0';
  return start + 1 === end ? `${end} of ${total}` : `${start + 1} to ${end} of ${total}`;
}

export type PageItem = { kind: 'page'; page: number } | { kind: 'gap'; before: number };

/** How many items the numbered pages take once there are more pages than fit. */
export const PAGE_ITEM_SLOTS = 7;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * The numbered pages to offer: the first, the last, and the current page with
 * its neighbours, with a gap where pages are left out.
 *
 * Always exactly seven items once there are seven pages or more, so the bar
 * keeps one width and nothing beside it moves as the page changes. Near either
 * end the extra room goes to more pages ("1 2 3 4 5 … 25") rather than to a
 * shorter row. A gap always stands for at least two pages — one page would take
 * the same room as the gap, so it is shown instead.
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= PAGE_ITEM_SLOTS) return range(1, pageCount).map((n) => ({ kind: 'page', page: n }));

  // The run around the current page: three wide, slid inward so it never meets either end.
  const runStart = Math.max(Math.min(page - 1, pageCount - 4), 3);
  const runEnd = Math.min(Math.max(page + 1, 5), pageCount - 2);

  const items: PageItem[] = [{ kind: 'page', page: 1 }];
  items.push(runStart > 3 ? { kind: 'gap', before: runStart } : { kind: 'page', page: 2 });
  for (const n of range(runStart, runEnd)) items.push({ kind: 'page', page: n });
  items.push(runEnd < pageCount - 2 ? { kind: 'gap', before: pageCount } : { kind: 'page', page: pageCount - 1 });
  items.push({ kind: 'page', page: pageCount });
  return items;
}
