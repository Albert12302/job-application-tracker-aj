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

const CONTROL = 'h-9 max-[760px]:h-11';
const ICON = 'size-9 max-[760px]:size-11';

/**
 * Below the list (SPEC §4.2): rows per page, the "x–y of n" range, and First,
 * Previous, the numbered pages, Next, and Last — a labelled <nav> of links, the
 * current page marked aria-current (§10.4). Below 760px the numbers go and the
 * rest stays (§11): there, First and Last are the only way to either end.
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

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 outline-none"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span id={sizeLabel} className="text-[13px] whitespace-nowrap text-muted-foreground">
          Rows per page
        </span>
        <Select
          value={pageSize}
          onValueChange={(value) => onPageSize(value as PageSize)}
          disabled={paging === null}
        >
          <SelectTrigger aria-labelledby={sizeLabel} className={`${CONTROL} w-[76px]`}>
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
          <p className="text-[13px] whitespace-nowrap text-muted-foreground">
            <span aria-hidden="true">{rangeLabel(paging)}</span>
            <span className="sr-only">{spokenRange(paging)}</span>
          </p>
        ) : null}
      </div>

      <Pagination aria-label="Pages">
        <PaginationContent className="flex-wrap gap-1">
          <PaginationItem>
            {page > 1 ? (
              <PaginationFirst className={ICON} render={link(1)} />
            ) : (
              <PaginationFirst className={ICON} {...unavailable} />
            )}
          </PaginationItem>
          <PaginationItem>
            {page > 1 ? (
              <PaginationPrevious className={CONTROL} render={link(page - 1)} />
            ) : (
              <PaginationPrevious className={CONTROL} {...unavailable} />
            )}
          </PaginationItem>
          {paging && !narrow
            ? pageItems(page, pageCount).map((item) =>
                item.kind === 'gap' ? (
                  <PaginationItem key={`gap-${item.before}`}>
                    <PaginationEllipsis className="h-9 w-6 text-muted-foreground" />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item.page}>
                    <PaginationLink
                      isActive={item.page === page}
                      aria-label={`Page ${item.page}`}
                      className={`h-9 w-auto min-w-9 px-2 ${item.page === page ? '' : 'text-muted-foreground'}`}
                      render={link(item.page)}
                    >
                      {item.page}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )
            : null}
          <PaginationItem>
            {paging && page < pageCount ? (
              <PaginationNext className={CONTROL} render={link(page + 1)} />
            ) : (
              <PaginationNext className={CONTROL} {...unavailable} />
            )}
          </PaginationItem>
          <PaginationItem>
            {paging && page < pageCount ? (
              <PaginationLast className={ICON} render={link(pageCount)} />
            ) : (
              <PaginationLast className={ICON} {...unavailable} />
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
