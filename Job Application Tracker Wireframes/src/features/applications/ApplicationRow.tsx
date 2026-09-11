import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, PaperclipIcon } from 'lucide-react';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatUtcDate, NUMERIC_DATE } from '@/domain/date';
import type { Application } from '@/domain/schemas';
import { useToggleStar } from '@/queries/use-application-mutations';
import { NoneMark } from './NoneMark';
import { StarToggle } from './StarToggle';
import { StatusTag } from './StatusTag';
import { useOpenApplication } from './use-open-application';

const WRAP = 'whitespace-normal break-words';

/**
 * One application in the table (SPEC §4.2). Clicking anywhere on the row opens
 * it; the keyboard way in is the company link, and the star is its own button.
 */
export function ApplicationRow({ application }: { application: Application }) {
  const open = useOpenApplication(application.id);
  const star = useToggleStar();
  const { id, company, starred } = application;

  return (
    <TableRow onClick={open} className="cursor-pointer">
      <TableCell className="pr-0">
        <StarToggle
          starred={starred}
          company={company}
          onToggle={() => star.mutate({ id, starred: !starred, company })}
        />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {formatUtcDate(application.date_applied, NUMERIC_DATE)}
      </TableCell>
      <TableCell className={`max-w-56 font-semibold ${WRAP}`}>
        <Link to="/applications/$id" params={{ id }} className="rounded-sm hover:underline">
          {company}
        </Link>
      </TableCell>
      <TableCell className={`max-w-56 ${WRAP}`}>{application.position}</TableCell>
      <TableCell className={`max-w-44 ${WRAP}`}>{application.location ?? <NoneMark />}</TableCell>
      <TableCell>
        <StatusTag status={application.status} />
      </TableCell>
      <TableCell>
        {application.cover_letter_name ? (
          <>
            <PaperclipIcon aria-hidden="true" className="size-4" />
            <span className="sr-only">Attached</span>
          </>
        ) : (
          <NoneMark />
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        <span aria-hidden="true">{application.referral ? 'Y' : 'N'}</span>
        <span className="sr-only">{application.referral ? 'Yes' : 'No'}</span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        <ChevronRightIcon aria-hidden="true" className="size-4" />
      </TableCell>
    </TableRow>
  );
}
