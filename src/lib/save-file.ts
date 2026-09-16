/**
 * Saves a downloaded file under `filename` (SPEC §4.4).
 *
 * Retyped as `application/octet-stream` before it gets a URL: a `blob:` URL
 * belongs to the app's own origin, so a browser that ignored `download` and
 * opened it would be rendering the file as the app. As an octet stream it can
 * only ever be saved.
 *
 * Its own module so component tests can stand in for a save jsdom cannot
 * perform.
 */
export function saveFile(file: Blob, filename: string): void {
  const url = URL.createObjectURL(new Blob([file], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari starts the save after the click returns; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
