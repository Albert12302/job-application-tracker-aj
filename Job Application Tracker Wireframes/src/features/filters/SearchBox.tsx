import { SearchIcon } from 'lucide-react';
import { type Ref, useId, useState } from 'react';
import { Input } from '@/components/ui/input';

const MAX = 120;

/**
 * The dashboard search (SPEC §4.2, §5.1): company, position, or location, on
 * top of the active filter. A persistent visible label, not a placeholder
 * (§10.3).
 *
 * The box keeps its own text and sends each change up to the URL. The URL
 * answers a moment later, so tying the box straight to it would drop keys typed
 * in between; instead, a URL value this box sent is ignored, and any other —
 * Clear filters, the Home link — replaces the text.
 */
export function SearchBox({
  value,
  onChange,
  disabled,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());

  if (value !== seen) {
    setSeen(value);
    if (value === text || !sent.has(value)) {
      setText(value);
      setSent(new Set());
    }
  }

  return (
    <div className="flex items-center gap-2 max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        Search
      </label>
      <div className="relative w-[280px] max-[760px]:w-full">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          id={id}
          type="search"
          value={text}
          maxLength={MAX}
          disabled={disabled}
          autoComplete="off"
          placeholder="Company, position, or location"
          className="h-9 bg-card pl-8 max-[760px]:h-11"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            setSent((current) => new Set(current).add(next));
            onChange(next);
          }}
        />
      </div>
    </div>
  );
}
