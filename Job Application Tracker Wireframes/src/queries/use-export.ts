import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { saveFile } from '@/lib/save-file';
import { exportData, exportFilename, type ExportStage } from '@/services/export-data';
import { reporting } from './errors';
import { keys } from './keys';
import { useSignedInUser } from './use-session';

/**
 * Export my data (SPEC §9.8). A mutation rather than a query: it is something
 * the user asks for, not something the screen has.
 *
 * Nothing is invalidated — an export reads and writes nothing — and no cache
 * entry is kept, because a zip built ten minutes ago is not what the user
 * pressing the button is asking for.
 *
 * **Saving the file happens here, not in a `mutate()` callback.** React Query
 * drops call-level callbacks when the observer unmounts, and the export button
 * lives inside the deletion dialog (§9.7) — closing it, or leaving Profile,
 * would have thrown away a finished zip with no download and no error. The user
 * asked for a file, so producing the file is the whole operation, not a step the
 * caller is trusted to finish.
 *
 * The mutation key lets the deletion dialog see that an export is running
 * before it offers to destroy the account it is exporting.
 */
export function useExportData() {
  const user = useSignedInUser();
  const [stage, setStage] = useState<ExportStage | null>(null);

  const mutation = useMutation({
    mutationKey: keys.dataExport(user.id),
    mutationFn: () =>
      reporting('export_data', async () => {
        const zip = await exportData(user.id, setStage);
        saveFile(zip, exportFilename());
      }),
    onSettled: () => setStage(null),
  });

  return { ...mutation, stage };
}
