import { useState } from 'react';
import { toast } from 'sonner';
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
import type { Application } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { useDeleteApplications, WriteRateLimitedError } from '@/queries/use-application-mutations';
import { useNoteCount } from '@/queries/use-notes';
import { applicationCount, bulkDeleteFailure, companyList, deleteSummary } from './delete-summary';

type Failure = { deleted: number; attempted: number; company: string; error: unknown };

/**
 * Confirm deleting the selected applications (SPEC §9.2): names them, says what
 * goes with them, and cannot be undone — so, like the single delete, no Undo.
 *
 * If a delete fails part-way, what was deleted is gone from the list and the
 * dialog stays open on the rest, saying where it stopped; confirming again
 * carries on from there.
 */
export function BulkDeleteDialog({
  open,
  onOpenChange,
  applications,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: Application[];
  /** Ids that are gone, whether the whole delete finished or not. */
  onDeleted: (ids: string[], finished: boolean) => void;
}) {
  // The last non-empty selection: once a delete finishes the selection empties
  // while the dialog is still closing, and it must not read "Delete 0 applications?".
  const [shown, setShown] = useState(applications);
  const key = (list: Application[]) => list.map((application) => application.id).join();
  if (applications.length > 0 && key(applications) !== key(shown)) setShown(applications);

  const ids = shown.map((application) => application.id);
  const notes = useNoteCount(ids, open);
  const remove = useDeleteApplications();
  const [failure, setFailure] = useState<Failure | null>(null);

  const count = shown.length;
  const files = shown.filter((application) => application.cover_letter_path !== null).length;
  const single = count === 1 ? shown[0] : undefined;

  let summary: string;
  if (notes.isPending) summary = 'Counting their notes…';
  else if (notes.isError) summary = 'Their notes and attached files are deleted with them.';
  else summary = deleteSummary(notes.data, files) ?? '';

  const confirm = () =>
    remove.mutate(ids, {
      onSuccess: ({ deleted, failed }) => {
        if (!failed) {
          setFailure(null);
          onOpenChange(false);
          onDeleted(deleted, true);
          toast.success(deleted.length === 1 ? 'Application deleted.' : `${deleted.length} applications deleted.`);
          return;
        }
        const company = shown.find((application) => application.id === failed.id)?.company ?? 'an application';
        setFailure({ deleted: deleted.length, attempted: count, company, error: failed.error });
        onDeleted(deleted, false);
      },
    });

  const rateLimited = failure?.error instanceof WriteRateLimitedError;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFailure(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single ? `Delete your application to ${single.company}?` : `Delete ${applicationCount(count)}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {single ? '' : `${companyList(shown.map((application) => application.company))}. `}
            {summary ? `${summary} ` : ''}
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure ? (
          <ErrorState
            title={
              bulkDeleteFailure(failure.deleted, failure.attempted, failure.company) +
              (rateLimited ? " You've made a lot of changes in the last minute. Wait a minute, then try again." : '')
            }
            reference={rateLimited ? null : errorReference(failure.error)}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>{count === 1 ? 'Keep application' : 'Keep applications'}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending || notes.isPending || count === 0}
            onClick={confirm}
          >
            {remove.isPending ? 'Deleting…' : `Delete ${applicationCount(count)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
