import { FileTextIcon, Loader2Icon } from 'lucide-react';
import { useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { coverLetterLabel, formatFileSize } from '@/domain/cover-letter';
import { CoverLetterPicker } from './CoverLetterPicker';

/**
 * The add form's cover letter (SPEC §4.3). Nothing is uploaded here: the file is
 * held until the application saves, then sent (AddApplicationScreen), so
 * choosing or clearing one never touches Storage and needs no confirmation.
 *
 * `problem` is a file refused on choosing, shown under the field (§4.4 copy).
 */
export function CoverLetterField({
  file,
  problem,
  uploading,
  onPick,
  onClear,
}: {
  file: File | null;
  problem: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const id = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const labelId = `${id}-label`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-sm leading-snug font-medium">
        Cover letter (optional)
      </span>

      {file ? (
        <div className="flex items-start gap-2.5 rounded-lg border p-3" aria-busy={uploading || undefined}>
          {uploading ? (
            <Loader2Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-link" />
          ) : (
            <FileTextIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{coverLetterLabel(file.name)}</p>
            <p className="text-[13px] text-muted-foreground">
              {uploading ? 'Uploading…' : formatFileSize(file.size)}
            </p>
          </div>
        </div>
      ) : null}

      {/* The same picker before and after a file is chosen, so focus stays on it. */}
      <div className="flex flex-wrap gap-2">
        <CoverLetterPicker
          inputRef={pickerRef}
          onPick={onPick}
          pending={uploading}
          describedBy={problem ? `${errorId} ${helpId}` : helpId}
        >
          {file ? 'Choose a different file' : 'Attach cover letter'}
        </CoverLetterPicker>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9 max-[760px]:h-11"
            onClick={() => {
              onClear();
              pickerRef.current?.focus(); // this button is about to go
            }}
          >
            Remove file
          </Button>
        ) : null}
      </div>

      <p id={helpId} className="text-[13px] text-muted-foreground">
        PDF, DOC, or DOCX, up to 10 MB.
      </p>
      {problem ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
