import { Link, Outlet } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { displayName } from '@/domain/profile';
import { useAvatarImage, useProfile } from '@/queries/use-profile';
import { useSignedInUser } from '@/queries/use-session';

/**
 * The persistent header (SPEC §4.2): app name, nav, avatar + name opening
 * Profile.
 */
export function AppShell() {
  const user = useSignedInUser();
  const profile = useProfile();
  const avatar = useAvatarImage(profile.data?.avatar_path);
  const name = displayName(profile.data?.name, user.email);

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only rounded-md bg-card px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2 max-[760px]:px-3.5">
          {/* shrink-0 and nowrap: a long profile name must not squeeze the
              brand and nav, which it did by wrapping "AJ's Hunt" onto two lines. */}
          <div className="flex shrink-0 items-center gap-6">
            <Link
              to="/applications"
              className="rounded-sm font-heading text-[15px] font-semibold whitespace-nowrap"
            >
              AJ's Hunt
            </Link>
            <nav aria-label="Main">
              <ul className="flex gap-4">
                <li>
                  <Link
                    to="/applications"
                    className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground aria-[current=page]:text-link"
                  >
                    Home
                  </Link>
                </li>
                <li>
                  <Link
                    to="/stats"
                    className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-muted-foreground aria-[current=page]:text-link"
                  >
                    Stats
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          {/* min-w-0 so a long name truncates rather than squeezing the nav. */}
          <Link
            to="/profile"
            className="flex min-w-0 min-h-11 items-center gap-2 rounded-md px-1 text-sm font-semibold"
          >
            <UserAvatar name={name} src={avatar.data} />
            {profile.isPending ? (
              <>
                <Skeleton aria-hidden="true" className="h-4 w-16" />
                <span className="sr-only">Profile</span>
              </>
            ) : (
              // Capped as well as truncated, so a very long name takes a
              // readable strip of the header rather than all of it.
              <span className="min-w-0 max-w-[14rem] truncate max-[760px]:max-w-[7rem]" title={name}>
                <span className="sr-only">Profile: </span>
                {name}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-6 outline-none max-[760px]:px-3.5">
        <Outlet />
      </main>
    </div>
  );
}
