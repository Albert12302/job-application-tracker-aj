import { PaperclipIcon } from 'lucide-react';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SelectCheckbox } from './SelectCheckbox';

/** The header's select-all box: ticked when every row is, mixed when some are. */
export type SelectAll = { checked: boolean; indeterminate: boolean; onCheckedChange: (checked: boolean) => void };

/**
 * The list's columns (SPEC §4.2). Icon-only and empty headers carry a name for
 * screen readers (§10.1), so every cell is announced with its column. The
 * loading skeleton shares it without a select-all box, since there is nothing
 * to select yet.
 */
export function ApplicationTableHeader({ selectAll }: { selectAll?: SelectAll }) {
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
        <TableHead>Date</TableHead>
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
