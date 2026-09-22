import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { displayName } from '@/domain/profile';
import { errorReference } from '@/queries/errors';
import { useProfile } from '@/queries/use-profile';
import { useSignedInUser } from '@/queries/use-session';
import { ApplicationCount } from './ApplicationCount';
import { AvatarUpload } from './AvatarUpload';
import { NameField } from './NameField';
import { DeleteAccountButton } from './DeleteAccountButton';
import { ExportDataButton } from './ExportDataButton';
import { SignOutButton } from './SignOutButton';

const CARD = 'mx-auto flex w-full max-w-[320px] flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs';

/**
 * SPEC §4.6: avatar (click to upload, "Remove photo" reverts to the initial),
 * name (its own control, NameField), application count, sign out. Sign out
 * stays reachable in every state, so a broken profile never traps anyone in
 * the app.
 */
export function ProfileScreen() {
  const user = useSignedInUser();
  const profile = useProfile();

  if (profile.isPending) {
    return (
      <div className={CARD} aria-busy="true">
        <span className="sr-only" role="status">
          Loading your profile
        </span>
        <div className="flex flex-col items-center gap-2" aria-hidden="true">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton aria-hidden="true" className="h-9 w-full max-[760px]:h-11" />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className={CARD}>
        <ErrorState title="Couldn't load your profile." reference={errorReference(profile.error)}>
          <Button size="lg" onClick={() => void profile.refetch()}>
            Retry
          </Button>
        </ErrorState>
        <SignOutButton />
      </div>
    );
  }

  const name = displayName(profile.data?.name, user.email);

  return (
    <section aria-labelledby="profile-name" className={CARD}>
      <div className="flex flex-col items-center gap-2 text-center">
        <AvatarUpload name={name} path={profile.data?.avatar_path ?? null} />
        <NameField name={name} stored={profile.data?.name ?? null} />
        <ApplicationCount />
      </div>
      <ExportDataButton />
      <SignOutButton />
      <DeleteAccountButton />
    </section>
  );
}
