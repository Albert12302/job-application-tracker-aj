import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { ApplicationTableHeader } from './ApplicationTableHeader';

const ROWS = [0, 1, 2, 3, 4];
// One width per column, close to the real content, so nothing jumps when data lands (§8.1).
const CELLS = ['size-4', 'size-4', 'w-12', 'w-28', 'w-32', 'w-24', 'w-16 rounded-full', 'w-4', 'w-4', 'w-4'];

/**
 * Five skeleton rows in the real table shell (§8.2), or five card shapes below
 * 760px. Hidden from screen readers; the screen announces "Loading" instead.
 */
export function ApplicationListSkeleton({ narrow }: { narrow: boolean }) {
  if (narrow) {
    return (
      <ul aria-hidden="true" className="divide-y">
        {ROWS.map((row) => (
          <li key={row} className="flex flex-col gap-2.5 p-3.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-28" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3.5 w-14" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div aria-hidden="true">
      <Table>
        <ApplicationTableHeader />
        <TableBody>
          {ROWS.map((row) => (
            <TableRow key={row} className="hover:bg-transparent">
              {CELLS.map((width, cell) => (
                <TableCell key={cell} className="h-12">
                  <Skeleton className={`h-4 ${width}`} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
