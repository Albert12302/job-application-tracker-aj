import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { exportData, type ExportStage } from '@/services/export-data';
import { reporting } from './errors';
import { useSignedInUser } from './use-session';

/**
 * Export my data (SPEC §9.8). A mutation rather than a query: it is something
 * the user asks for, not something the screen has.
 *
 * Nothing is invalidated — an export reads and writes nothing — and no cache
 * entry is kept, because a zip built ten minutes ago is not what the user
 * pressing the button is asking for. Saving the file is the caller's, as it is
 * for a cover letter: a hook does not reach for the DOM.
 */
export function useExportData() {
  const user = useSignedInUser();
  const [stage, setStage] = useState<ExportStage | null>(null);

  const mutation = useMutation({
    mutationFn: () => reporting('export_data', () => exportData(user.id, setStage)),
    onSettled: () => setStage(null),
  });

  return { ...mutation, stage };
}
