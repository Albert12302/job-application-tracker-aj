import { useOnline } from '@/hooks/use-online';

/**
 * The offline banner (SPEC §8.2): persistent while the browser has no network,
 * above every screen — signed out as much as signed in, since a sign-in that
 * cannot reach Auth needs the reason as much as a save does.
 *
 * The live region is mounted always and the bar moves in and out of it, rather
 * than the region arriving with its text already inside: a region that mounts
 * holding its content is not reliably announced (§10.4).
 *
 * No dismiss button. It reports a condition rather than asking for a decision,
 * it leaves by itself when the network returns, and a dismissed banner would
 * take the explanation away from the failures that follow.
 *
 * `--background` text on a `--foreground` bar measures 15.07:1 (§10.1), and the
 * page's own padding tightens below 760px like everything else (§11).
 */
export function OfflineBanner() {
  const online = useOnline();

  return (
    <div role="status">
      {online ? null : (
        <p className="bg-foreground px-4 py-2 text-center text-sm font-medium text-background max-[760px]:px-3.5">
          You're offline. Changes won't save.
        </p>
      )}
    </div>
  );
}
