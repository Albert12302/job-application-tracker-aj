import { STATUS_TOKENS, type Status } from '@/domain/status';
import { cn } from '@/lib/utils';

/**
 * A status as a tag (SPEC §3), in the same colours everywhere it appears. The
 * label is always the text, so status is never carried by colour alone (§10.1).
 */
export function StatusTag({ status, className }: { status: Status; className?: string }) {
  const tone = STATUS_TOKENS[status];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        tone.bg,
        tone.fg,
        className,
      )}
    >
      {status}
    </span>
  );
}
