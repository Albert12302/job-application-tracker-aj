import { PaperclipIcon } from 'lucide-react';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * The list's columns (SPEC §4.2). Icon-only and empty headers carry a name for
 * screen readers (§10.1), so every cell is announced with its column.
 */
export function ApplicationTableHeader() {
  return (
    <TableHeader className="[&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
      <TableRow className="hover:bg-transparent">
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
