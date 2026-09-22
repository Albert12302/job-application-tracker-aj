/**
 * The app name, which is the document title only where no page can give one
 * (SPEC §10.2).
 *
 * Each route declares its own title in its `head`, and that title is the page
 * name alone — "Add application", "Your Stats" — with no app-name suffix. A tab
 * is narrow and truncates from the right, so a suffix repeated on every screen
 * costs the room the distinguishing part needs and gives nothing back: the app
 * names itself in its own header, on screen, already.
 *
 * This constant is the fallback: the root route carries it, and an address that
 * matches nothing renders `notFoundComponent` with only the root matched, so
 * there is no page name to use. `index.html` carries it too, as the title
 * before the router has rendered.
 *
 * A detail screen's title is deliberately generic ("Application"), never the
 * company: a title is read out, shown in the tab strip, and kept in browser
 * history, and this is a job hunt. Whose job it is stays inside the page.
 */
export const APP_NAME = "AJ's Hunt";
