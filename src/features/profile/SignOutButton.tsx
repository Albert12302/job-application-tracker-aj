import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/queries/use-mutations';
import { isSignedInNow } from '@/queries/use-session';

export function SignOutButton() {
  const signOut = useSignOut();

  return (
    <Button
      variant="outline"
      className="h-9 w-full border-destructive/70 text-destructive hover:bg-destructive/10 max-[760px]:h-11"
      disabled={signOut.isPending}
      onClick={() =>
        signOut.mutate(undefined, {
          // auth-js drops the local session even when the server revoke fails,
          // so say what actually happened rather than a flat "failed".
          onError: () =>
            isSignedInNow()
              ? toast.error("Couldn't sign out. Try again.")
              : toast.error("Signed out here, but the server couldn't be reached to end the session."),
        })
      }
    >
      {signOut.isPending ? (
        <>
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          Signing out…
        </>
      ) : (
        'Sign out'
      )}
    </Button>
  );
}
