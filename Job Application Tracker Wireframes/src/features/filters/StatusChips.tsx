import { CheckIcon } from 'lucide-react';
import { STATUS_TOKENS, STATUSES, type Status } from '@/domain/status';
import { cn } from '@/lib/utils';

/**
 * The builder's statuses (§5.1): real checkboxes, drawn as the §3 tags. A
 * chosen one takes its status colours, a check, and the focus-colour outline,
 * so the choice shows by shape as well as colour (§10.1). None chosen means
 * every status.
 */
export function StatusChips({ value, onChange }: { value: readonly Status[]; onChange: (next: Status[]) => void }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-semibold">Statuses (none = all)</legend>
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((status) => {
          const on = value.includes(status);
          const tone = STATUS_TOKENS[status];
          return (
            <label
              key={status}
              className={cn(
                'relative inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap max-[760px]:h-11 max-[760px]:px-3.5',
                'has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2',
                on ? cn(tone.bg, tone.fg, 'ring-2 ring-primary ring-offset-1') : 'border border-input bg-card text-foreground',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={(event) =>
                  onChange(event.target.checked ? [...value, status] : value.filter((chosen) => chosen !== status))
                }
              />
              {on ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
              {status}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
