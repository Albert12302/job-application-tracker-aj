/**
 * What a delete takes with it (SPEC §9.2): "This also deletes 3 notes and 1
 * attached file." Null when the application is all there is, so the dialog
 * does not claim to delete nothing.
 */
export function deleteSummary(noteCount: number, hasFile: boolean): string | null {
  const parts: string[] = [];
  if (noteCount > 0) parts.push(noteCount === 1 ? '1 note' : `${noteCount} notes`);
  if (hasFile) parts.push('1 attached file');
  return parts.length ? `This also deletes ${parts.join(' and ')}.` : null;
}
