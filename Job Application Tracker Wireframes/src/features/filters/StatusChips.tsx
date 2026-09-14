import { CheckIcon, MinusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { STATUS_TOKENS, STATUSES, type Status } from '@/domain/status';
import { cn } from '@/lib/utils';

const CHIP =
  'relative inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap max-[760px]:h-11 max-[760px]:px-3.5 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2';
const UNCHOSEN = 'border border-input bg-card text-foreground';
const CHOSEN_OUTLINE = 'ring-2 ring-primary ring-offset-1';

/**
 * The builder's statuses (§5.1): real checkboxes, drawn as the §3 tags. A
 * chosen one takes its status colours, a check, and the primary outline, so
 * the choice shows by shape as well as colour (§10.1).
 *
 * All comes first: ticked when every status is, mixed when only some are, and
 * it ticks or clears all six at once.
 */
export function StatusChips({
  value,
  onChange,
  error,
  errorId,
}: {
  value: readonly Status[];
  onChange: (next: Status[]) => void;
  error?: string | undefined;
  errorId: string;
}) {
  const every = value.length === STATUSES.length;
  const some = value.length > 0 && !every;

  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
    >
      <legend className="mb-1.5 text-[13px] font-semibold">Statuses</legend>
      <div className="flex flex-wrap gap-1.5">
        <Chip
          checked={every}
          indeterminate={some}
          onChange={() => onChange(every ? [] : [...STATUSES])}
          className={every || some ? cn('bg-secondary text-secondary-foreground', CHOSEN_OUTLINE) : UNCHOSEN}
        >
          All
        </Chip>
        {STATUSES.map((status) => {
          const on = value.includes(status);
          const tone = STATUS_TOKENS[status];
          return (
            <Chip
              key={status}
              checked={on}
              onChange={(checked) =>
                onChange(checked ? STATUSES.filter((s) => s === status || value.includes(s)) : value.filter((s) => s !== status))
              }
              className={on ? cn(tone.bg, tone.fg, CHOSEN_OUTLINE) : UNCHOSEN}
            >
              {status}
            </Chip>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function Chip({
  checked,
  indeterminate = false,
  onChange,
  className,
  children,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <label className={cn(CHIP, className)}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        // Mixed is a DOM property, not an attribute; screen readers announce it as "mixed".
        ref={(input) => {
          if (input) input.indeterminate = indeterminate;
        }}
        onChange={(event) => onChange(event.target.checked)}
      />
      {checked ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
      {indeterminate ? <MinusIcon aria-hidden="true" className="size-3" /> : null}
      {children}
    </label>
  );
}
