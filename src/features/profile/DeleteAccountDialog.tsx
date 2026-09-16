import { useId, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/ErrorState';
import { errorReference } from '@/queries/errors';
import { keys } from '@/queries/keys';
import { useDeletionSummary } from '@/queries/use-delete-account';
import { useSignedInUser } from '@/queries/use-session';
import type { DeletionStage } from '@/services/delete-account';
import {
  deletionFailureMessage,
  deletionProgressLabel,
  deletionSummarySentence,
  emailMatches,
  failedDeletionStage,
} from './deletion-summary';
import { ExportDataButton } from './ExportDataButton';

/**
 * Confirm deleting the account (SPEC §9.7).
 *
 * Typing the address, not a button: this is the one operation with no recovery
 * path, and nothing else in the app asks for typed confirmation. The dialog
 * offers the export first (§9.8) — the way out has to be reachable from in
 * front of the door, not only from the screen behind it.
 *
 * A Dialog, not an AlertDialog: this one holds a text field, and a form belongs
 * in `dialog`. Base UI gives the focus trap, Escape, and the return of focus to
 * the trigger (§10.2).
 */

export function DeleteAccountDialog({
  open,
  onOpenChange,
  pending,
  stage,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  stage: DeletionStage | null;
  error: unknown;
  onConfirm: () => void;
}) {
  const user = useSignedInUser();
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const hintId = useId();

  // Counted when the dialog opens, never before: the number shown before an
  // irreversible act should be the number that is true now.
  const summary = useDeletionSummary(open);

  // An export the user started from in here is the thing standing between them
  // and losing everything, so nothing may destroy the account while it runs
  // (§9.8). Read from the mutation key rather than passed down, because the
  // export button owns its own state.
  const exporting = useIsMutating({ mutationKey: keys.dataExport(user.id) }) > 0;

  const confirmed = emailMatches(typed, user.email);
  const failedStage = failedDeletionStage(error, stage);

  // Nothing irreversible before the numbers land: §8.2 promises the confirm is
  // disabled until counted. `isPending` only — a count that failed shows the
  // sentence without its numbers and must still not block the delete (§9.2).
  const ready = !summary.isPending && !exporting;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Nothing closes mid-delete; the account may be half gone.
        if (pending) return;
        if (!next) setTyped('');
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={!pending} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            {summary.isPending ? 'Counting what goes…' : deletionSummarySentence(summary.data ?? null)}
          </DialogDescription>
        </DialogHeader>

        {/* §9.8 before §9.7: the exit is offered here, not just on the screen behind. */}
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm font-medium">Export my data first</p>
          <p className="text-sm text-muted-foreground">
            Everything above, as a zip you keep. Nothing here is recoverable afterwards.
          </p>
          <ExportDataButton />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Type your email address to confirm</Label>
          <Input
            id={inputId}
            aria-describedby={hintId}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            onChange={(event) => setTyped(event.target.value)}
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            {user.email}
          </p>
        </div>

        {error ? <ErrorState title={deletionFailureMessage(failedStage)} reference={errorReference(error)} /> : null}

        {/* Always mounted, so the first progress message is announced (§10.4). */}
        <span role="status" aria-label="Account deletion progress" className="sr-only">
          {pending ? deletionProgressLabel(stage) : ''}
        </span>

        <DialogFooter>
          <DialogClose disabled={pending} render={<Button variant="outline" />}>
            Keep my account
          </DialogClose>
          <Button variant="destructive" disabled={pending || !confirmed || !ready} onClick={onConfirm}>
            {pending ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {deletionProgressLabel(stage)}
              </>
            ) : (
              'Delete my account'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
