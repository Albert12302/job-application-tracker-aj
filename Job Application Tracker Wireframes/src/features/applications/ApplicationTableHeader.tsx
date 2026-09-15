import { ChevronDownIcon, ChevronUpIcon, PaperclipIcon } from 'lucide-react';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ListSort } from '@/domain/order';
import { SelectCheckbox } from './SelectCheckbox';

/** The header's select-all box: ticked when every row is, mixed when some are. */
export type SelectAll = { checked: boolean; indeterminate: boolean; onCheckedChange: (checked: boolean) => void };

/**
 * The list's columns (SPEC §4.2). Icon-only and empty headers carry a name for
 * screen readers (§10.1), so every cell is announced with its column. The
 * loading skeleton shares it without a select-all box, since there is nothing
 * to select yet, and without the sort button, since there is nothing to sort.
 *
 * The date column is the sort (§4.2): its header is a button that flips newest
 * and oldest first, the chevron shows which, and the column carries aria-sort
 * (§10.4). Screen readers hear the order from aria-sort, and the button's name
 * says what pressing it does.
 */
export function ApplicationTableHeader({
  selectAll,
  sort,
  onSort,
}: {
  selectAll?: SelectAll;
  sort: ListSort;
  onSort?: () => void;
}) {
  const Chevron = sort === 'date-asc' ? ChevronUpIcon : ChevronDownIcon;

  return (
    <TableHeader className="[&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-10 pr-0">
          {selectAll ? (
            <SelectCheckbox label="Select all applications" {...selectAll} />
          ) : (
            <span className="sr-only">Select</span>
          )}
        </TableHead>
        <TableHead className="w-10">
          <span className="sr-only">Starred</span>
        </TableHead>
        <TableHead aria-sort={onSort ? (sort === 'date-asc' ? 'ascending' : 'descending') : undefined}>
          {onSort ? (
            <button
              type="button"
              onClick={onSort}
              className="-ml-1.5 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-1.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              Date
              <Chevron aria-hidden="true" className="size-3.5" />
              <span className="sr-only">, show {sort === 'date-asc' ? 'newest' : 'oldest'} first</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1">
              Date
              <Chevron aria-hidden="true" className="size-3.5" />
            </span>
          )}
        </TableHead>
        <TableHead>Company</TableHead>
        <TableHead>Position</TableHead>
        <TableHead>Location</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="w-10">
          <PaperclipIcon aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Cover letter</span>
        </TableHead>
        <TableHead>Referral</TableHead>
        <TableHead className="w-8">
          <span className="sr-only">Open</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}
