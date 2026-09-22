import { useEffect } from 'react';

/**
 * Sets the document title from something the screen had to load (SPEC §10.2).
 *
 * A route's own title is static and belongs in its `head` (CLAUDE.md). This is
 * for the one title that cannot be known until a row arrives — the detail
 * screen's, which names the company — and nothing else should reach for it.
 *
 * `null` leaves whatever the route's `head` wrote, so the loading, error and
 * not-found states keep the plain fallback rather than flashing a title built
 * from data that is not there.
 *
 * Nothing is restored when this unmounts: `HeadContent` rewrites the title from
 * the next route's `head` on every navigation away, and undoing it here would
 * only race that.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
