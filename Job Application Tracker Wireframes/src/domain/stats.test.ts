import { describe, expect, it } from 'vitest';
import type { StatusChange } from './schemas';
import { computeStats, percentOf, reachOf } from './stats';
import type { Status } from './status';

/** A history for one application: the creation row, then each change a minute apart. */
function path(id: string, ...statuses: Status[]): StatusChange[] {
  return statuses.map((to_status, minute) => ({
    application_id: id,
    to_status,
    changed_at: new Date(Date.UTC(2026, 8, 1, 12, minute)).toISOString(),
  }));
}

/** Stats for one application whose current status is the last in its path. */
function statsFor(...statuses: Status[]) {
  return computeStats([{ id: 'a', status: statuses.at(-1)! }], path('a', ...statuses));
}

describe('reachOf', () => {
  it('is the last funnel stage held', () => {
    expect(reachOf('Offer', path('a', 'Applied', 'Interview', 'Callback', 'Offer'))).toEqual({ stage: 3, heardBack: false });
  });

  it('keeps the stage when the application closes', () => {
    expect(reachOf('Rejected', path('a', 'Applied', 'Interview', 'Rejected')).stage).toBe(1);
    expect(reachOf('Withdrawn', path('a', 'Applied', 'Callback', 'Offer', 'Withdrawn')).stage).toBe(3);
  });

  it('replays by changed_at, not by the order the rows arrive in', () => {
    const [created, interview, callback] = path('a', 'Applied', 'Interview', 'Callback');
    expect(reachOf('Callback', [callback!, created!, interview!]).stage).toBe(2);
  });

  it('measures an application with no history by its current status alone', () => {
    expect(reachOf('Interview', [])).toEqual({ stage: 1, heardBack: false });
    expect(reachOf('Rejected', [])).toEqual({ stage: -1, heardBack: true });
    expect(reachOf('Withdrawn', [])).toEqual({ stage: -1, heardBack: false });
  });

  it('lets the current status overrule a history that stops short of it', () => {
    expect(reachOf('Interview', path('a', 'Applied', 'Offer')).stage).toBe(1);
  });
});

describe('computeStats — furthest stage reached (§4.5)', () => {
  it('counts Interview → Rejected as Interviewed and Heard back', () => {
    expect(statsFor('Applied', 'Interview', 'Rejected')).toMatchObject({
      interviewed: 1,
      callbacks: 0,
      offers: 0,
      heardBack: 1,
    });
  });

  it('counts an offer that was turned down as an Offer, a Callback, and Interviewed', () => {
    expect(statsFor('Applied', 'Callback', 'Offer', 'Withdrawn')).toMatchObject({
      interviewed: 1,
      callbacks: 1,
      offers: 1,
      heardBack: 1,
    });
  });

  it('counts a jump straight to Offer as every stage before it', () => {
    expect(statsFor('Applied', 'Offer')).toMatchObject({ interviewed: 1, callbacks: 1, offers: 1, heardBack: 1 });
  });

  it('counts Applied → Rejected as Heard back only', () => {
    expect(statsFor('Applied', 'Rejected')).toMatchObject({ interviewed: 0, callbacks: 0, offers: 0, heardBack: 1 });
  });

  it('counts Applied → Withdrawn as nothing', () => {
    expect(statsFor('Applied', 'Withdrawn')).toMatchObject({ interviewed: 0, callbacks: 0, offers: 0, heardBack: 0 });
  });

  it('counts a still-Applied application as nothing', () => {
    expect(statsFor('Applied')).toMatchObject({ total: 1, interviewed: 0, heardBack: 0 });
  });
});

describe('computeStats — a move back is a correction', () => {
  it('Offer picked by mistake, then back to Interview: no Offer, no Callback', () => {
    expect(statsFor('Applied', 'Interview', 'Offer', 'Interview')).toMatchObject({
      interviewed: 1,
      callbacks: 0,
      offers: 0,
      heardBack: 1,
    });
  });

  it('back to Applied undoes everything, a rejection included', () => {
    expect(statsFor('Applied', 'Interview', 'Applied')).toMatchObject({ interviewed: 0, heardBack: 0 });
    expect(statsFor('Applied', 'Rejected', 'Applied')).toMatchObject({ interviewed: 0, heardBack: 0 });
  });

  it('a correction that is later closed stays corrected', () => {
    expect(statsFor('Applied', 'Offer', 'Interview', 'Rejected')).toMatchObject({ offers: 0, interviewed: 1, heardBack: 1 });
  });

  it('reopening a closed application at an earlier stage lowers it to that stage', () => {
    expect(statsFor('Applied', 'Callback', 'Rejected', 'Interview')).toMatchObject({ callbacks: 0, interviewed: 1 });
  });

  it('moving forward again after a correction counts again', () => {
    expect(statsFor('Applied', 'Offer', 'Applied', 'Interview', 'Offer')).toMatchObject({ offers: 1 });
  });

  it('closing never lowers anything: Withdrawn after Rejected still heard back', () => {
    expect(statsFor('Applied', 'Rejected', 'Withdrawn')).toMatchObject({ heardBack: 1 });
  });
});

describe('computeStats — the set', () => {
  it('reads each application from its own history, and ignores rows for applications not in the set', () => {
    const stats = computeStats(
      [
        { id: 'a', status: 'Rejected' },
        { id: 'b', status: 'Applied' },
      ],
      [...path('a', 'Applied', 'Interview', 'Rejected'), ...path('b', 'Applied'), ...path('deleted', 'Applied', 'Offer')],
    );
    expect(stats).toMatchObject({ total: 2, interviewed: 1, offers: 0, heardBack: 1 });
  });

  it('breaks down by current status, in §3 order, leaving out statuses with no applications', () => {
    const stats = computeStats(
      [
        { id: 'a', status: 'Withdrawn' },
        { id: 'b', status: 'Applied' },
        { id: 'c', status: 'Rejected' },
        { id: 'd', status: 'Applied' },
      ],
      path('c', 'Applied', 'Interview', 'Rejected'),
    );
    expect(stats.breakdown).toEqual([
      { status: 'Applied', count: 2 },
      { status: 'Rejected', count: 1 },
      { status: 'Withdrawn', count: 1 },
    ]);
    expect(stats.breakdown.reduce((sum, part) => sum + part.count, 0)).toBe(stats.total);
  });

  it('has nothing to show for no applications', () => {
    expect(computeStats([], [])).toEqual({ total: 0, interviewed: 0, callbacks: 0, offers: 0, heardBack: 0, breakdown: [] });
  });

  it('gives dev-a’s seeded applications (supabase/seed.sql) one more Interviewed than current status would', () => {
    const stats = computeStats(
      [
        { id: '1', status: 'Callback' },
        { id: '2', status: 'Interview' },
        { id: '3', status: 'Offer' },
        { id: '4', status: 'Rejected' },
        { id: '5', status: 'Withdrawn' },
        { id: '6', status: 'Applied' },
        { id: '7', status: 'Applied' },
      ],
      [
        ...path('1', 'Applied', 'Interview', 'Callback'),
        ...path('3', 'Applied', 'Interview', 'Offer'),
        ...path('4', 'Applied', 'Interview', 'Rejected'),
      ],
    );
    expect(stats).toMatchObject({ total: 7, interviewed: 4, callbacks: 2, offers: 1, heardBack: 4 });
  });
});

describe('percentOf', () => {
  it('rounds to a whole percentage of the total', () => {
    expect(percentOf(4, 7)).toBe(57);
    expect(percentOf(2, 7)).toBe(29);
    expect(percentOf(1, 7)).toBe(14);
    expect(percentOf(7, 7)).toBe(100);
    expect(percentOf(0, 7)).toBe(0);
  });

  it('is 0 of an empty set, never NaN or Infinity', () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});
