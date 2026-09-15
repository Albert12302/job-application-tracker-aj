import { describe, expect, it } from 'vitest';
import { newestFirst, oldestFirst, sortApplications, sortLabel } from './order';

let next = 0;
const app = (date_applied: string, created_at: string, id = `00000000-0000-0000-0000-${String(next++).padStart(12, '0')}`) => ({
  id,
  date_applied,
  created_at,
});

describe('newestFirst', () => {
  it('puts the latest date applied first', () => {
    const rows = [app('2026-08-01T00:00:00+00:00', '2026-09-01T00:00:00+00:00'), app('2026-09-01T00:00:00+00:00', '2026-09-01T00:00:00+00:00')];
    expect(rows.sort(newestFirst).map((r) => r.date_applied.slice(0, 10))).toEqual(['2026-09-01', '2026-08-01']);
  });

  it('within one day, puts the most recently added first', () => {
    const early = app('2026-09-01T00:00:00+00:00', '2026-09-01T09:00:00.000001+00:00');
    const late = app('2026-09-01T00:00:00+00:00', '2026-09-01T17:00:00+00:00');
    expect([early, late].sort(newestFirst)).toEqual([late, early]);
  });

  it('compares moments, not strings, across offset spellings', () => {
    const z = app('2026-09-01T00:00:00.000Z', '2026-09-01T10:00:00.000Z');
    const offset = app('2026-09-01T00:00:00+00:00', '2026-09-01T09:00:00+00:00');
    expect([offset, z].sort(newestFirst)).toEqual([z, offset]);
  });

  it('breaks a full tie — same date, added in the same moment — by id, as the database does', () => {
    const b = app('2026-09-01T00:00:00+00:00', '2026-09-01T10:00:00+00:00', 'b0000000-0000-0000-0000-000000000000');
    const a = app('2026-09-01T00:00:00+00:00', '2026-09-01T10:00:00+00:00', 'a0000000-0000-0000-0000-000000000000');
    expect([b, a].sort(newestFirst)).toEqual([a, b]);
    expect([a, b].sort(newestFirst)).toEqual([a, b]);
  });
});

describe('oldestFirst', () => {
  it('is newest first exactly reversed, ties included', () => {
    const rows = [
      app('2026-09-01T00:00:00+00:00', '2026-09-01T10:00:00+00:00', 'a0000000-0000-0000-0000-000000000000'),
      app('2026-09-01T00:00:00+00:00', '2026-09-01T10:00:00+00:00', 'b0000000-0000-0000-0000-000000000000'),
      app('2026-09-01T00:00:00+00:00', '2026-09-02T10:00:00+00:00'),
      app('2026-08-15T00:00:00+00:00', '2026-09-01T10:00:00+00:00'),
      app('2026-09-12T00:00:00+00:00', '2026-09-01T10:00:00+00:00'),
    ];
    expect([...rows].sort(oldestFirst)).toEqual([...rows].sort(newestFirst).reverse());
  });
});

describe('sortApplications', () => {
  const august = app('2026-08-31T00:00:00+00:00', '2026-09-01T10:00:00+00:00');
  const september = app('2026-09-01T00:00:00+00:00', '2026-09-01T10:00:00+00:00');

  it('orders by the URL sort without changing the array it was given', () => {
    const given = [august, september];
    expect(sortApplications(given, 'date-desc')).toEqual([september, august]);
    expect(sortApplications(given, 'date-asc')).toEqual([august, september]);
    expect(given).toEqual([august, september]);
  });

  // A UTC-midnight date read in the viewer's zone would put the 1st on the 31st west of Greenwich
  // (§5.4). Moments do not move, so the order holds whatever TZ the suite runs in.
  it('keeps the 1st of the month after the 31st in every zone', () => {
    expect(sortApplications([august, september], 'date-desc')[0]).toBe(september);
  });
});

describe('sortLabel', () => {
  it('names each order for the phone control (§11)', () => {
    expect(sortLabel('date-desc')).toBe('Newest first');
    expect(sortLabel('date-asc')).toBe('Oldest first');
  });
});
