/**
 * Hands a signed URL straight to the browser (SPEC §7.3). Storage answers with
 * `Content-Disposition: attachment`, so the file saves and the tab stays on the
 * app; the URL is never put in the page.
 *
 * Its own module so component tests can stand in for a navigation jsdom cannot
 * perform.
 */
export function startDownload(url: string): void {
  window.location.assign(url);
}
