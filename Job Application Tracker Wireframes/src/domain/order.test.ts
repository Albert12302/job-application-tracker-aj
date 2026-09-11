import { describe, expect, it } from 'vitest';
import { newestFirst } from './order';

const app = (date_applied: string, created_at: string) => ({ date_applied, created_at });

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
});
