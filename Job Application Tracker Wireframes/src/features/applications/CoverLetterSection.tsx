import { FileTextIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { coverLetterLabel } from '@/domain/cover-letter';
import type { Application } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import {
  CoverLetterRejectedError,
  useAttachCoverLetter,
  useDownloadCoverLetter,
  useLatestCoverLetterUpload,
  useRemoveCoverLetter,
} from '@/queries/use-cover-letter';
import { CoverLetterPicker } from './CoverLetterPicker';
import { CoverLetterSize } from './CoverLetterSize';
import { SECTION_HEADING } from './panel';
import { RemoveCoverLetterDialog } from './RemoveCoverLetterDialog';
import { saveFile } from './save-file';

const ACTION = 'h-9 max-[760px]:h-11';

/**
 * The detail screen's cover letter (SPEC §4.4, §9.4): its name and size, and
 * download, attach or replace, and remove.
 *
 * An upload shows on the row while it runs, and a failed one offers Retry with
 * the same file (§8.2) — including one the add form started before handing
 * over to this screen. Download asks for a signed URL only when clicked (§7.3).
 */
export function CoverLetterSection({ application }: { application: Application }) {
  const helpId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { id, cover_letter_path: path, cover_letter_name: name } = application;
  const file = path && name ? { path, label: coverLetterLabel(name) } : null;
  const [removing, setRemoving] = useState<typeof file>(null);
  const removedRef = useRef(false);

  // After a removal the Remove button no longer exists; without this, focus
  // would fall to the page and a keyboard user would start again from the top.
  useEffect(() => {
    if (confirmRemove || !removedRef.current || path) return;
    removedRef.current = false;
    pickerRef.current?.focus();
  }, [confirmRemove, path]);

  const attach = useAttachCoverLetter();
  const upload = useLatestCoverLetterUpload(id);
  const remove = useRemoveCoverLetter(id);
  const download = useDownloadCoverLetter(id);

  const uploading = upload?.status === 'pending' ? upload.variables : null;
  const failed = upload?.status === 'error' ? upload : null;
  const rejected = failed?.error instanceof CoverLetterRejectedError ? failed.error : null;
  const busy = !!uploading || remove.isPending;

  const start = (picked: File) => {
    download.reset();
    attach.mutate(
      { applicationId: id, file: picked, currentPath: path },
      { onSuccess: () => toast.success(path ? 'Cover letter replaced.' : 'Cover letter attached.') },
    );
  };

  const fetchDownload = () => {
    if (!file) return;
    const { path: from, label } = file;
    download.mutate(from, {
      onSuccess: (bytes) => {
        saveFile(bytes, label);
        download.reset(); // the bytes are saved; nothing needs to keep them
      },
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <h2 className={SECTION_HEADING}>Cover letter</h2>

      <div className="flex flex-col gap-3 rounded-lg border p-3" aria-busy={busy || undefined}>
        {file ? (
          <div className="flex items-start gap-2.5">
            <FileTextIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              {/* The original filename, a label only — rendered as text, never markup (§7.3). */}
              <p className="text-sm font-medium [overflow-wrap:anywhere]">{file.label}</p>
              <CoverLetterSize path={file.path} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No cover letter attached.</p>
        )}

        {uploading ? (
          <p className="flex items-center gap-2 text-sm">
            <Loader2Icon aria-hidden="true" className="size-4 shrink-0 animate-spin text-link" />
            <span className="[overflow-wrap:anywhere]">Uploading {coverLetterLabel(uploading.file.name)}…</span>
          </p>
        ) : null}

        {/* One picker in one place, relabelled rather than swapped, so focus stays
            on it when an attach turns into a replace. */}
        <div className="flex flex-wrap gap-2">
          {file ? (
            <Button
              variant="outline"
              className={ACTION}
              // The visible word, plus what it acts on (§10.3, label in name).
              aria-label={download.isPending ? 'Preparing the download' : 'Download cover letter'}
              disabled={download.isPending}
              onClick={fetchDownload}
            >
              {download.isPending ? (
                <>
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                  Preparing…
                </>
              ) : (
                'Download'
              )}
            </Button>
          ) : null}
          <CoverLetterPicker
            inputRef={pickerRef}
            onPick={start}
            pending={!!uploading}
            disabled={remove.isPending}
            describedBy={helpId}
            name={file ? 'Replace cover letter' : 'Attach cover letter'}
          >
            {file ? 'Replace' : 'Attach cover letter'}
          </CoverLetterPicker>
          {file ? (
            <Button
              variant="outline"
              className={ACTION}
              aria-label="Remove cover letter"
              disabled={busy}
              onClick={() => {
                remove.reset();
                setRemoving(file);
                setConfirmRemove(true);
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <p id={helpId} className="text-[13px] text-muted-foreground">
          PDF, DOC, or DOCX, up to 10 MB.
        </p>
      </div>

      <p role="status" className="sr-only">
        {uploading ? 'Uploading cover letter…' : download.isPending ? 'Preparing the download…' : ''}
      </p>

      {rejected ? (
        <p role="alert" className="text-sm text-destructive">
          {rejected.userMessage}
        </p>
      ) : failed?.variables ? (
        <ErrorState title="Upload failed." reference={errorReference(failed.error)}>
          <Button className={ACTION} disabled={busy} onClick={() => start(failed.variables!.file)}>
            Retry
          </Button>
        </ErrorState>
      ) : null}

      {download.isError ? (
        <ErrorState title="Couldn't download the cover letter." reference={errorReference(download.error)}>
          <Button className={ACTION} onClick={fetchDownload} disabled={!file}>
            Retry
          </Button>
        </ErrorState>
      ) : null}

      {/* Mounted throughout, and holding the file it was opened for, so it can
          close normally after that file is gone. */}
      <RemoveCoverLetterDialog
        open={removing !== null && confirmRemove}
        onOpenChange={setConfirmRemove}
        label={removing?.label ?? ''}
        pending={remove.isPending}
        error={remove.error}
        // Kept: focus returns to Remove. Removed: that button is gone, so the
        // dialog leaves focus alone and the effect above moves it to Attach.
        finalFocus={() => !removedRef.current}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.path, {
            onSuccess: () => {
              removedRef.current = true;
              setConfirmRemove(false);
              toast.success('Cover letter removed.');
            },
          });
        }}
      />
    </div>
  );
}
