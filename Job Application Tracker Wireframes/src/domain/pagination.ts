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

/**
 * The numbered pages to offer: the first, the last, and the current page with
 * its neighbours, with a gap where pages are left out — at most seven items
 * however many pages there are. A gap never stands for a single page: that page
 * is shown instead, since the gap would take the same room.
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  const wanted = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((candidate) => candidate >= 1 && candidate <= pageCount)
    .sort((a, b) => a - b);

  const items: PageItem[] = [];
  let previous = 0;
  for (const candidate of wanted) {
    if (candidate - previous === 2) items.push({ kind: 'page', page: previous + 1 });
    else if (candidate - previous > 2) items.push({ kind: 'gap', before: candidate });
    items.push({ kind: 'page', page: candidate });
    previous = candidate;
  }
  return items;
}
