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
