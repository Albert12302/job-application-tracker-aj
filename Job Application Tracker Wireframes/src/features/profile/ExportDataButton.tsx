import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ErrorState';
import { saveFile } from '@/lib/save-file';
import { errorReference } from '@/queries/errors';
import { useExportData } from '@/queries/use-export';
import { exportFilename } from '@/services/export-data';
import { exportProgressLabel } from './export-progress';

/**
 * Export my data (SPEC §9.8): one button, no options, no format picker.
 *
 * Progress goes in the button, and the same words go to a live region — the
 * spinner says "still working" to anyone who can see it and nothing at all to
 * anyone who cannot (§10.4).
 */
export function ExportDataButton() {
  const exportData = useExportData();
  const label = exportProgressLabel(exportData.stage);
  const run = () => exportData.mutate(undefined, { onSuccess: (zip) => saveFile(zip, exportFilename()) });

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        className="h-9 w-full max-[760px]:h-11"
        disabled={exportData.isPending}
        onClick={run}
      >
        {exportData.isPending ? (
          <>
            <Loader2Icon aria-hidden="true" className="animate-spin" />
            {label}
          </>
        ) : (
          <>
            <DownloadIcon aria-hidden="true" />
            Export my data
          </>
        )}
      </Button>

      {/* Always mounted: a live region added to the page at the same moment as
          its text is not reliably announced. */}
      <span role="status" className="sr-only">
        {exportData.isPending ? label : exportData.isSuccess ? 'Your export is ready.' : ''}
      </span>

      {exportData.isError ? (
        <ErrorState title="Couldn't export your data." reference={errorReference(exportData.error)}>
          <Button variant="outline" className="h-9 max-[760px]:h-11" onClick={run}>
            Retry
          </Button>
        </ErrorState>
      ) : null}
    </div>
  );
}
