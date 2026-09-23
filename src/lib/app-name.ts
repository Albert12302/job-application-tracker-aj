/**
 * The app's name, which is the document title only where no page can give one
 * (SPEC §10.2).
 *
 * It lives here, not in `routes/`, because both a route and a feature need it —
 * the root route's fallback title and the signed-out card's heading — and
 * `features/` may not import from `routes/`. Same reasoning as `save-file.ts`:
 * a thing two layers share sits above both.
 *
 * Each route declares its own title in its `head`, and that title is the page
 * name alone — "Add application", "Your Stats" — with no app-name suffix. A tab
 * is narrow and truncates from the right, so a suffix repeated on every screen
 * costs the room the distinguishing part needs and gives nothing back: the app
 * names itself in its own header, on screen, already.
 *
 * This is the fallback: the root route carries it, and an address that matches
 * nothing renders `notFoundComponent` with only the root matched, so there is
 * no page name to use. `index.html` carries it too, as the title before the
 * router has rendered.
 */
export const APP_NAME = "AJ's Hunt";
