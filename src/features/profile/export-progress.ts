import type { ExportStage } from '@/services/export-data';

/**
 * What the export button and its live region both say (SPEC §9.8, §10.4). One
 * string for both: a spinner tells anyone who can see it that work is
 * happening, and anyone who cannot needs the same words.
 */
export function exportProgressLabel(stage: ExportStage | null): string {
  if (!stage) return 'Preparing your data…';
  switch (stage.stage) {
    case 'reading':
      return 'Preparing your data…';
    case 'files':
      // Nothing to count is not worth a count of zero.
      return stage.total === 0 ? 'Building your export…' : `Adding files (${stage.done} of ${stage.total})…`;
    case 'packing':
      return 'Building your export…';
  }
}
