/**
 * The words a delete confirmation uses (SPEC §9.2), for one application or
 * several.
 */

const plural = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/**
 * What a delete takes with it: "This also deletes 3 notes and 1 attached
 * file." Null when the applications are all there is, so the dialog does not
 * claim to delete nothing.
 */
export function deleteSummary(noteCount: number, fileCount: number): string | null {
  const parts: string[] = [];
  if (noteCount > 0) parts.push(plural(noteCount, 'note', 'notes'));
  if (fileCount > 0) parts.push(plural(fileCount, 'attached file', 'attached files'));
  return parts.length ? `This also deletes ${parts.join(' and ')}.` : null;
}

/** "1 application" / "3 applications". */
export function applicationCount(count: number): string {
  return plural(count, 'application', 'applications');
}

const LIST = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/**
 * The companies a bulk delete names (§9.2 names the record): "Litware and
 * Contoso", "Litware, Contoso, and Fabrikam" — past `max`, the rest are
 * counted: "…, Tailspin Toys, and 3 more".
 */
export function companyList(companies: readonly string[], max = 5): string {
  if (companies.length <= max) return LIST.format(companies);
  return LIST.format([...companies.slice(0, max), `${companies.length - max} more`]);
}

/**
 * Why a bulk delete stopped: "Deleted 2 of 5 applications. Couldn't delete
 * Contoso." — or just the second sentence when nothing was deleted first.
 */
export function bulkDeleteFailure(deleted: number, attempted: number, company: string): string {
  const couldnt = `Couldn't delete ${company}.`;
  return deleted > 0 ? `Deleted ${deleted} of ${applicationCount(attempted)}. ${couldnt}` : couldnt;
}
