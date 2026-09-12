import type { ReactNode, Ref } from 'react';
import { useId } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { COVER_LETTER_ACCEPT } from '@/domain/cover-letter';
import { cn } from '@/lib/utils';

/**
 * Choosing a cover letter (SPEC §4.3, §4.4): a real file input, visually hidden,
 * named by a label drawn as a button. So it takes the keyboard and has a name
 * (§10.2), and the focus ring is drawn on the thing the user sees — the same
 * pattern as the avatar upload.
 */
export function CoverLetterPicker({
  children,
  name,
  onPick,
  disabled = false,
  pending = false,
  describedBy,
  inputRef,
}: {
  children: ReactNode;
  /** The input's accessible name, when the visible label is shorter: it must contain the visible words. */
  name?: string;
  onPick: (file: File) => void;
  disabled?: boolean;
  /** Disabled because this control's own work is under way: the cursor waits rather than refuses. */
  pending?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        // A hint for the picker only; the bytes are checked before upload (§7.3).
        accept={COVER_LETTER_ACCEPT}
        className="peer sr-only"
        disabled={disabled || pending}
        aria-label={name}
        aria-describedby={describedBy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // picking the same file again must fire change
          if (file) onPick(file);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'h-9 max-[760px]:h-11',
          'peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring',
          'peer-disabled:opacity-50',
          pending ? 'peer-disabled:cursor-wait' : 'peer-disabled:cursor-not-allowed',
        )}
      >
        {children}
      </label>
    </>
  );
}
