import { useId } from 'react';
import type { TriState } from '@/domain/schemas';
import { cn } from '@/lib/utils';
import { TAB_WELL, tabButton } from './tab-styles';

/**
 * Any / yes / no for referral or starred (§5.1), drawn like the filter tabs.
 * Native radios underneath, so arrow keys move the choice and a screen reader
 * hears a radio group (§10.2).
 */
export function TriStateChoice({
  legend,
  labels,
  value,
  onChange,
}: {
  legend: string;
  labels: Record<TriState, string>;
  value: TriState;
  onChange: (next: TriState) => void;
}) {
  const name = useId();
  const options: TriState[] = ['any', 'yes', 'no'];

  return (
    <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-semibold">{legend}</legend>
      <div className={cn(TAB_WELL, 'w-fit')}>
        {options.map((option) => (
          <label
            key={option}
            className={cn(tabButton(value === option), 'relative has-focus-visible:ring-2 has-focus-visible:ring-ring')}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === option}
              onChange={() => onChange(option)}
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
