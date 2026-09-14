export type PreviewTab = { show: (url: string) => void; close: () => void };

/**
 * A blank tab for a cover letter preview (SPEC §4.4), opened during the click.
 *
 * Opened before the signed URL exists: a tab opened after an await is no
 * longer tied to the click, and Safari blocks it as a pop-up. Null when the
 * browser blocked it anyway.
 *
 * `opener` is cut straight away, so the page the tab ends up showing can never
 * reach back into the app. (`noopener` would do that too, but then there is no
 * handle to point the tab at the URL once it arrives.) `replace`, so Back in
 * that tab does not return to the blank page.
 *
 * Its own module so component tests can stand in for a tab jsdom cannot open.
 */
export function openPreviewTab(): PreviewTab | null {
  const tab = window.open('', '_blank');
  if (!tab) return null;
  tab.opener = null;
  return {
    show: (url) => tab.location.replace(url),
    close: () => tab.close(),
  };
}
