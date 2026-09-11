import { Table, TableBody, TableCaption } from '@/components/ui/table';
import type { Application } from '@/domain/schemas';
import { ApplicationRow } from './ApplicationRow';
import { ApplicationTableHeader } from './ApplicationTableHeader';

/** A real <table> (§10.4), at 760px and wider. */
export function ApplicationTable({ applications }: { applications: Application[] }) {
  return (
    <Table>
      <TableCaption className="sr-only">Your applications, newest first</TableCaption>
      <ApplicationTableHeader />
      <TableBody>
        {applications.map((application) => (
          <ApplicationRow key={application.id} application={application} />
        ))}
      </TableBody>
    </Table>
  );
}
