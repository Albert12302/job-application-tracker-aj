import { describe, expect, it } from 'vitest';
import { formatMoment, formatUtcDate, toDateInputValue, todayDateInputValue, toUtcMidnight } from './date';

describe('toUtcMidnight', () => {
  it('appends UTC midnight to a date input value', () => {
    expect(toUtcMidnight('2026-09-10')).toBe('2026-09-10T00:00:00.000Z');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => toUtcMidnight('09/10/2026')).toThrow();
    expect(() => toUtcMidnight('2026-09-10T12:00:00Z')).toThrow();
  });
});

describe('formatUtcDate', () => {
  // The bug this module exists to prevent: UTC midnight formatted in a western
  // zone shows the previous day.
  //
  // THIS ASSERTION IS INERT UNDER TZ=UTC. It only fails where the bug exists, so
  // CI runs the suite twice — TZ=UTC and TZ=America/Los_Angeles (CLAUDE.md,
  // Testing). A green run on a UTC-only runner proves nothing here.
  it('shows the stored day, not the local one', () => {
    const formatted = formatUtcDate('2026-09-10T00:00:00.000Z', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    expect(formatted).toContain('10');
    expect(formatted).not.toContain('09/09');
  });

  it('round-trips through the input value unchanged', () => {
    expect(toDateInputValue(toUtcMidnight('2026-01-01'))).toBe('2026-01-01');
    expect(toDateInputValue(toUtcMidnight('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('todayDateInputValue', () => {
  // Each case is inert on one side of Greenwich, so between the TZ=UTC and
  // TZ=PST8PDT runs (plus any eastern developer machine) both directions are
  // covered: late evening is already tomorrow in UTC for the west, and just
  // after midnight is still yesterday in UTC for the east.
  it('is the local calendar day late in the evening', () => {
    expect(todayDateInputValue(new Date(2026, 8, 10, 23, 30))).toBe('2026-09-10');
  });

  it('is the local calendar day just after midnight', () => {
    expect(todayDateInputValue(new Date(2026, 8, 10, 0, 30))).toBe('2026-09-10');
  });

  it('pads single-digit months and days', () => {
    expect(todayDateInputValue(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('formatMoment', () => {
  it('renders a real moment without throwing', () => {
    expect(formatMoment('2026-09-10T18:30:00.000Z')).toBeTruthy();
  });
});
