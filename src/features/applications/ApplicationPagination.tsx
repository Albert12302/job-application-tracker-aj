import { Link } from '@tanstack/react-router';
import { useId, type MouseEvent, type Ref } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_SIZES, pageItems, rangeLabel, spokenRange, type PageSize, type PageWindow } from '@/domain/pagination';
import type { ApplicationsSearch } from '@/domain/schemas';

// As the prototype draws them: First, Previous, Next, and Last are white buttons with a light
// edge — named by their word or chevron, so the edge is decoration (§10.1) — and stay white,
// only faded, while unavailable.
const FILLED = 'border-border bg-card aria-disabled:hover:bg-card';
const CONTROL = 'h-9 max-[760px]:h-11';
const ICON = 'size-9 max-[760px]:size-11';

/**
 * Below the list (SPEC §4.2): rows per page, the "x–y of n" range, and First,
 * Previous, the numbered pages, Next, and Last — a labelled <nav> of links, the
 * current page marked aria-current (§10.4). Below 760px the numbers go and the
 * rest stays (§11): there, First and Last are the only way to either end, and
 * "Page 12 of 25" between Previous and Next says where this is.
 *
 * The pages are links to the list's own URL, so a page can be opened in a new
 * tab, reloaded, and gone back to. `activeOptions.exact` keeps the router from
 * marking a link current on its own: page 1's URL carries no page, and a
 * partial match would call it current from every other page.
 *
 * While the list loads, `paging` is null: the controls show, disabled, with no
 * range (§8.2).
 */
export function ApplicationPagination({
  paging,
  pageSize,
  narrow,
  linkSearch,
  onPageSize,
  onPageLink,
  ref,
}: {
  paging: PageWindow | null;
  pageSize: PageSize;
  narrow: boolean;
  /** The list's URL state for a link to `page`. */
  linkSearch: (page: number) => ApplicationsSearch;
  onPageSize: (size: PageSize) => void;
  /** A link to `page` was clicked — the screen moves focus to the new page if this tab goes there. */
  onPageLink: (page: number, event: MouseEvent<HTMLAnchorElement>) => void;
  /** Where Jump to bottom sends focus. */
  ref?: Ref<HTMLDivElement>;
}) {
  const sizeLabel = useId();
  const page = paging?.page ?? 1;
  const pageCount = paging?.pageCount ?? 1;

  const link = (target: number) => (
    <Link
      to="/applications"
      search={linkSearch(target)}
      activeOptions={{ exact: true }}
      resetScroll={false}
      onClick={(event) => onPageLink(target, event)}
    />
  );
  // No href, so not focusable; still read as a link that is unavailable.
  const unavailable = { role: 'link', 'aria-disabled': true } as const;
  const goTo = (target: number, available: boolean) => (available ? { render: link(target) } : unavailable);
  const hasPrevious = page > 1;
  const hasNext = paging !== null && page < pageCount;
  // On a phone Previous and Next are chevrons, like First and Last, to leave room for
  // "Page 12 of 25" on one line at 320px; screen readers still hear "Previous" and "Next".
  const step = narrow ? { className: `${ICON} ${FILLED}`, iconOnly: true } : { className: `${CONTROL} ${FILLED}` };
  const end = `${ICON} ${FILLED}`;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 outline-none"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span id={sizeLabel} className="text-[13px] whitespace-nowrap">
          Rows per page
        </span>
        <Select
          value={pageSize}
          onValueChange={(value) => onPageSize(value as PageSize)}
          disabled={paging === null}
        >
          <SelectTrigger aria-labelledby={sizeLabel} className={`${CONTROL} w-[76px] bg-card`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {paging ? (
          <p className="text-[13px] whitespace-nowrap">
            <span aria-hidden="true">{rangeLabel(paging)}</span>
            <span className="sr-only">{spokenRange(paging)}</span>
          </p>
        ) : null}
      </div>

      <Pagination aria-label="Pages" className="max-[760px]:w-full">
        <PaginationContent className="flex-wrap gap-1 max-[760px]:w-full max-[760px]:justify-between">
          <PaginationItem>
            <PaginationFirst className={end} {...goTo(1, hasPrevious)} />
          </PaginationItem>
          <PaginationItem>
            <PaginationPrevious {...step} {...goTo(page - 1, hasPrevious)} />
          </PaginationItem>
          {paging && narrow ? (
            // No numbers on a phone, so say which page this is (§11).
            <PaginationItem className="px-1 text-[13px] whitespace-nowrap">
              Page {page} of {pageCount}
            </PaginationItem>
          ) : null}
          {paging && !narrow
            ? pageItems(page, pageCount).map((item) =>
                item.kind === 'gap' ? (
                  <PaginationItem key={`gap-${item.before}`}>
                    {/* As wide as a number, so the seven items keep one width whatever the page. */}
                    <PaginationEllipsis className="h-9 w-9 text-muted-foreground" />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item.page}>
                    <PaginationLink
                      isActive={item.page === page}
                      aria-label={`Page ${item.page}`}
                      // The current page is white with a soft shadow, as in the prototype, and keeps
                      // the control edge (3.2:1): white alone on this page measures 1.1:1, too faint
                      // to show which page is current (§10.1). The others are plain numbers.
                      className={`h-9 w-auto min-w-9 px-2 ${
                        item.page === page ? 'bg-card shadow-[0_1px_2px_oklch(0%_0_0/0.06)] hover:bg-card' : ''
                      }`}
                      render={link(item.page)}
                    >
                      {item.page}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )
            : null}
          <PaginationItem>
            <PaginationNext {...step} {...goTo(page + 1, hasNext)} />
          </PaginationItem>
          <PaginationItem>
            <PaginationLast className={end} {...goTo(pageCount, hasNext)} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
