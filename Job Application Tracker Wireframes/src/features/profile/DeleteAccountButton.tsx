import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useDeleteAccount } from '@/queries/use-delete-account';
import { DeleteAccountDialog } from './DeleteAccountDialog';

/**
 * Delete my account (SPEC §9.7), reached from Profile and nowhere else.
 *
 * Set apart from the rest of the card by a rule and its own heading: this is
 * not another profile control, and it should not be reachable by a stray click
 * on the way to signing out.
 */
export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const deleteAccount = useDeleteAccount();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <h2 className="text-sm font-medium text-muted-foreground">Danger zone</h2>
      <Button
        variant="outline"
        className="h-9 w-full border-destructive/70 text-destructive hover:bg-destructive/10 max-[760px]:h-11"
        onClick={() => setOpen(true)}
      >
        Delete my account
      </Button>

      <DeleteAccountDialog
        open={open}
        onOpenChange={(next) => {
          // A failure belongs to the attempt that caused it. Without this, the
          // dialog reopens already showing the last one's alert and reference,
          // before the user has done anything.
          if (!next) deleteAccount.reset();
          setOpen(next);
        }}
        pending={deleteAccount.isPending}
        stage={deleteAccount.stage}
        error={deleteAccount.error}
        onConfirm={() =>
          deleteAccount.mutate(undefined, {
            // The session is already gone; this only decides where the browser
            // lands and what it is told (§9.7). `replace`, so Back cannot
            // return to a profile that no longer has an account behind it.
            onSuccess: () => void navigate({ to: '/sign-in', search: { deleted: true }, replace: true }),
          })
        }
      />
    </div>
  );
}
