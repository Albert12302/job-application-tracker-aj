/** The six statuses (SPEC §3). Fixed set — the database has a matching enum. */
export const STATUSES = [
  'Applied',
  'Interview',
  'Callback',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const;

export type Status = (typeof STATUSES)[number];

/** Funnel order for the detail-screen progress indicator (§3). */
export const FUNNEL: readonly Status[] = ['Applied', 'Interview', 'Callback', 'Offer'];

/** Closed, and outside the funnel (§3). */
export const TERMINAL: readonly Status[] = ['Rejected', 'Withdrawn'];

export function isTerminal(status: Status): boolean {
  return TERMINAL.includes(status);
}

/** -1 for terminal statuses, which have no funnel position. */
export function funnelIndex(status: Status): number {
  return FUNNEL.indexOf(status);
}

/**
 * Stats groupings (§4.5), named so the definitions live in one place.
 * "Heard back" in particular is easy to redefine by accident: it is everything
 * except Applied and Withdrawn, which means Rejected counts as a response.
 */
export const INTERVIEWED: readonly Status[] = ['Interview', 'Callback', 'Offer'];
export const CALLBACKS: readonly Status[] = ['Callback', 'Offer'];
export const HEARD_BACK: readonly Status[] = ['Interview', 'Callback', 'Offer', 'Rejected'];

/**
 * The audited palette (§3, §10.1). Measured ratios, not eyeballed — any change
 * here gets re-measured. Values are theme token names defined in
 * styles/globals.css, not raw hex, so a retint happens in one file.
 */
export const STATUS_TOKENS: Record<Status, { bg: string; fg: string; ratio: number }> = {
  Applied: { bg: 'bg-status-applied', fg: 'text-status-applied-fg', ratio: 7.2 },
  Interview: { bg: 'bg-status-interview', fg: 'text-status-interview-fg', ratio: 6.3 },
  Callback: { bg: 'bg-status-callback', fg: 'text-status-callback-fg', ratio: 7.5 },
  Offer: { bg: 'bg-status-offer', fg: 'text-status-offer-fg', ratio: 5.9 },
  Rejected: { bg: 'bg-status-rejected', fg: 'text-status-rejected-fg', ratio: 5.5 },
  Withdrawn: { bg: 'bg-status-withdrawn', fg: 'text-status-withdrawn-fg', ratio: 6.3 },
};
