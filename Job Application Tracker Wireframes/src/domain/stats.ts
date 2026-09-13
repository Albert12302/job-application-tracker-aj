import type { StatsApplication, StatusChange } from './schemas';
import { FUNNEL, STATUSES, funnelIndex, type Status } from './status';

/**
 * The stats screen's numbers (SPEC §4.5), from each application's current
 * status and its status_history rows (§2).
 *
 * The four funnel stats count the furthest stage an application reached, so
 * one that went Interview → Rejected still counts as Interviewed. Going back to
 * an earlier stage is a correction — the status was picked by mistake — and the
 * stages above it stop counting. Rejected and Withdrawn close an application
 * without lowering anything. The breakdown bar alone is by current status: it
 * has to add up to the total. Referrals are a plain count of the flag.
 */

export type StatusCount = { status: Status; count: number };

export type Stats = {
  total: number;
  interviewed: number;
  callbacks: number;
  offers: number;
  heardBack: number;
  /** Applications marked as coming through a referral. */
  referrals: number;
  /** In §3 order, zero counts left out (§4.5). */
  breakdown: StatusCount[];
};

/** How far one application got. `stage` is a FUNNEL index; -1 only before any funnel status. */
export type Reach = { stage: number; heardBack: boolean };

const INTERVIEW = FUNNEL.indexOf('Interview');
const CALLBACK = FUNNEL.indexOf('Callback');
const OFFER = FUNNEL.indexOf('Offer');
const APPLIED = FUNNEL.indexOf('Applied');

/**
 * One status, applied to how far the application had got. Moving forward and
 * moving back both land on the new stage — forward because it was reached,
 * back because the higher one was a mistake — so the stage is simply the last
 * funnel status held. Closing keeps it.
 */
function step(reach: Reach, status: Status): Reach {
  if (status === 'Rejected') return { ...reach, heardBack: true };
  if (status === 'Withdrawn') return reach;

  const stage = funnelIndex(status);
  // Back to Applied means nothing was heard after all, a rejection included.
  return { stage, heardBack: stage === APPLIED ? false : reach.heardBack };
}

/**
 * Replays an application's changes, oldest first, then its current status.
 * The current status goes last because it is the truth: an application with no
 * history rows (added before history existed, as some seed rows are) is
 * measured by its status alone, exactly as §4.5 used to.
 */
export function reachOf(current: Status, changes: readonly StatusChange[]): Reach {
  const ordered = [...changes].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at));
  const replayed = ordered.reduce((reach, change) => step(reach, change.to_status), { stage: -1, heardBack: false });
  return step(replayed, current);
}

/** Heard back: any stage past Applied, or a rejection that was not corrected. */
function heardBack(reach: Reach): boolean {
  return reach.stage >= INTERVIEW || reach.heardBack;
}

export function computeStats(applications: readonly StatsApplication[], history: readonly StatusChange[]): Stats {
  const changesById = new Map<string, StatusChange[]>();
  for (const change of history) {
    const list = changesById.get(change.application_id);
    if (list) list.push(change);
    else changesById.set(change.application_id, [change]);
  }

  const stats: Stats = {
    total: applications.length,
    interviewed: 0,
    callbacks: 0,
    offers: 0,
    heardBack: 0,
    referrals: 0,
    breakdown: [],
  };
  const counts = new Map<Status, number>();

  for (const application of applications) {
    const reach = reachOf(application.status, changesById.get(application.id) ?? []);
    if (reach.stage >= INTERVIEW) stats.interviewed += 1;
    if (reach.stage >= CALLBACK) stats.callbacks += 1;
    if (reach.stage >= OFFER) stats.offers += 1;
    if (heardBack(reach)) stats.heardBack += 1;
    if (application.referral) stats.referrals += 1;
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  stats.breakdown = STATUSES.flatMap((status) => {
    const count = counts.get(status) ?? 0;
    return count > 0 ? [{ status, count }] : [];
  });
  return stats;
}

/** A whole-number percentage of `total`. Zero of zero is 0, never NaN (§4.5). */
export function percentOf(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
