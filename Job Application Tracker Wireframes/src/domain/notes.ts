/**
 * SPEC §9.3: deleting a note asks for confirmation only when the note is longer
 * than a line; a shorter one is deleted at once, with Undo. A rendered line
 * depends on screen width, so "a line" is fixed here instead: at most 80
 * characters and no line break.
 */
export const ONE_LINE = 80;

export function noteDeleteNeedsConfirmation(body: string): boolean {
  return body.length > ONE_LINE || /[\r\n]/.test(body);
}

/**
 * Display order (SPEC §2): creation order, oldest first. Editing bumps
 * updated_at and must not move a note; an undone delete returns to its own
 * place. The list on screen is assembled from the query, an optimistic add,
 * and a restore, so the order is imposed where it is rendered rather than
 * left to those three agreeing.
 */
export function oldestFirst(a: { created_at: string }, b: { created_at: string }): number {
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}
