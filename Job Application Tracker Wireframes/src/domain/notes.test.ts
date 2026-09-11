import { describe, expect, it } from 'vitest';
import { noteDeleteNeedsConfirmation, ONE_LINE } from './notes';

describe('noteDeleteNeedsConfirmation', () => {
  it('deletes a one-line note without asking', () => {
    expect(noteDeleteNeedsConfirmation('Recruiter screen went well.')).toBe(false);
  });

  it('treats exactly one line as short', () => {
    expect(noteDeleteNeedsConfirmation('x'.repeat(ONE_LINE))).toBe(false);
  });

  it('asks past one line of characters', () => {
    expect(noteDeleteNeedsConfirmation('x'.repeat(ONE_LINE + 1))).toBe(true);
  });

  it('asks for any line break, however short the note', () => {
    expect(noteDeleteNeedsConfirmation('a\nb')).toBe(true);
    expect(noteDeleteNeedsConfirmation('a\r\nb')).toBe(true);
  });
});
