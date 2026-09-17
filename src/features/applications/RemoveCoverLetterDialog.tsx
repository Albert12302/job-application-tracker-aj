import type { ComponentProps } from 'react';
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
import { errorReference, failureMessage } from '@/queries/errors';

/**
 * Confirm before a cover letter is deleted (SPEC §9.4), naming the file. A
 * failure keeps the dialog open with the reason, so confirming again is the retry.
 */
export function RemoveCoverLetterDialog({
  open,
  onOpenChange,
  label,
  pending,
  error,
  onConfirm,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The display label, already cleaned (domain/cover-letter.ts). */
  label: string;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>['finalFocus'];
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the cover letter?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes <span className="font-medium text-foreground [overflow-wrap:anywhere]">{label}</span> from
            this application. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <ErrorState title={failureMessage("Couldn't remove the cover letter.", error)} reference={errorReference(error)} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep cover letter</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? 'Removing…' : 'Remove cover letter'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
