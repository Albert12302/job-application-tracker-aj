import { Table, TableBody, TableCaption } from '@/components/ui/table';
import type { Application } from '@/domain/schemas';
import { ApplicationRow } from './ApplicationRow';
import { ApplicationTableHeader, type SelectAll } from './ApplicationTableHeader';
import type { Selection } from './use-selection';

/** A real <table> (§10.4), at 760px and wider. */
export function ApplicationTable({ applications, selection }: { applications: Application[]; selection: Selection }) {
  const selectAll: SelectAll = {
    checked: selection.count > 0 && selection.count === applications.length,
    indeterminate: selection.count > 0 && selection.count < applications.length,
    onCheckedChange: (checked) => (checked ? selection.selectAll() : selection.clear()),
  };

  return (
    <Table>
      <TableCaption className="sr-only">Your applications, newest first</TableCaption>
      <ApplicationTableHeader selectAll={selectAll} />
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
