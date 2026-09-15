import type { Ref } from 'react';
import { Table, TableBody, TableCaption } from '@/components/ui/table';
import type { ListSort } from '@/domain/order';
import type { Application } from '@/domain/schemas';
import { ApplicationRow } from './ApplicationRow';
import { ApplicationTableHeader, type SelectAll } from './ApplicationTableHeader';
import type { Selection } from './use-selection';

/**
 * A real <table> (§10.4), at 760px and wider: the rows on the current page.
 * Focusable from script only, so a change of page can move focus to the new
 * page's start; its caption says which page that is.
 */
export function ApplicationTable({
  applications,
  selection,
  sort,
  onSort,
  caption,
  ref,
}: {
  applications: Application[];
  selection: Selection;
  sort: ListSort;
  onSort: () => void;
  caption: string;
  ref?: Ref<HTMLTableElement>;
}) {
  const selectAll: SelectAll = {
    checked: selection.count > 0 && selection.count === applications.length,
    indeterminate: selection.count > 0 && selection.count < applications.length,
    onCheckedChange: (checked) => (checked ? selection.selectAll() : selection.clear()),
  };

  return (
    <Table ref={ref} tabIndex={-1} className="outline-none">
      <TableCaption className="sr-only">{caption}</TableCaption>
      <ApplicationTableHeader selectAll={selectAll} sort={sort} onSort={onSort} />
      <TableBody>
        {applications.map((application) => (
          <ApplicationRow
            key={application.id}
            application={application}
            selected={selection.has(application.id)}
            onSelectedChange={(selected) => selection.set(application.id, selected)}
          />
        ))}
      </TableBody>
    </Table>
  );
}
