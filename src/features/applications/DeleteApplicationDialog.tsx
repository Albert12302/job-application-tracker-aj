import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ErrorState } from '@/components/ErrorState';
import { errorReference } from '@/queries/errors';
import { deleteSummary } from './delete-summary';

/**
 * Confirm a delete, naming the record and what goes with it (SPEC §9.2).
 * No Undo is offered, because none is implemented — §9.2 says not to show one
 * that does nothing.
 */
export function DeleteApplicationDialog({
  open,
  onOpenChange,
  company,
  noteCount,
  hasFile,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: string;
  noteCount: number;
  hasFile: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}) {
  const summary = deleteSummary(noteCount, hasFile ? 1 : 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your application to {company}?</AlertDialogTitle>
          <AlertDialogDescription>
            {summary ? `${summary} ` : ''}
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <ErrorState title="Couldn't delete this application." reference={errorReference(error)} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep application</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? 'Deleting…' : 'Delete application'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
