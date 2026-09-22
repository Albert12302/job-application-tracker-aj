/**
 * The document title, which every route sets through its `head` (SPEC §10.2).
 *
 * WCAG 2.4.2 Page Titled is a Level A criterion, and one static title for a
 * whole SPA does not meet it: the title is how a screen-reader user knows the
 * page changed, and how anyone with several tabs open tells them apart.
 *
 * The page comes first, because a tab narrows from the right — the part worth
 * keeping has to be the part that survives.
 *
 * A detail screen's title is deliberately generic ("Application"), never the
 * company: a title is read out, shown in the tab strip, and kept in browser
 * history, and this is a job hunt. Whose job it is stays inside the page.
 */

export const APP_NAME = "AJ's Hunt";

export function pageTitle(page: string): string {
  return `${page} — ${APP_NAME}`;
}
