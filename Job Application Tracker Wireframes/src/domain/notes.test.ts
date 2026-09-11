import { describe, expect, it } from 'vitest';
import { noteDeleteNeedsConfirmation, oldestFirst, ONE_LINE } from './notes';

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

describe('oldestFirst', () => {
  it('puts the earliest note first, whatever order it is given (§2)', () => {
    const first = { created_at: '2026-09-01T10:00:00+00:00' };
    const second = { created_at: '2026-09-02T10:00:00.000Z' };
    expect([second, first].sort(oldestFirst)).toEqual([first, second]);
  });

  it('compares moments, not strings, across offset spellings', () => {
    const noon = { created_at: '2026-09-01T12:00:00+00:00' };
    const earlier = { created_at: '2026-09-01T11:00:00.000Z' };
    expect([noon, earlier].sort(oldestFirst)).toEqual([earlier, noon]);
  });
});
