import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

const LINK =
  'inline-flex min-h-6 items-center rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring max-[760px]:min-h-11';

/**
 * The privacy policy and terms (SPEC §4.7), in the footer of every screen. Here
 * rather than in `features/legal/` because the shell and the signed-out card
 * both show it, and a feature may not import another's internals.
 */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn('text-sm text-muted-foreground', className)}>
      <ul className="flex justify-center gap-5">
        <li>
          <Link to="/privacy" className={LINK}>
            Privacy
          </Link>
        </li>
        <li>
          <Link to="/terms" className={LINK}>
            Terms
          </Link>
        </li>
      </ul>
    </nav>
  );
}
