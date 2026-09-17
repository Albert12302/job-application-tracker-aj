/**
 * date_applied is a calendar date stored as UTC midnight (SPEC §5.4).
 *
 * These functions are the only place that conversion is allowed to happen. They
 * exist as functions rather than inline calls because both directions have a
 * wrong version that looks right:
 *
 *   new Date(2026, 8, 10).toISOString()   // shifts by the browser's offset
 *   new Date(iso).toLocaleDateString()    // renders the 9th west of Greenwich
 *
 * A database constraint catches the first mistake. Nothing catches the second,
 * which is why every display goes through formatUtcDate.
 */

/** '2026-09-10' (an <input type="date"> value) -> '2026-09-10T00:00:00.000Z'. */
export function toUtcMidnight(dateInput: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    throw new Error('toUtcMidnight expects YYYY-MM-DD');
  }
  return dateInput + 'T00:00:00.000Z';
}

/** '2026-09-10T00:00:00Z' -> '2026-09-10', for an <input type="date"> value. */
export function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** The list's compact date, "9/2/26" in en-US (§4.2). */
export const NUMERIC_DATE: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', year: '2-digit' };

const LONG_DATE: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

// Building a formatter costs far more than using one, and a list formats a date per row.
const utcFormatters = new WeakMap<Intl.DateTimeFormatOptions, Intl.DateTimeFormat>();

/** Display a stored date_applied. Always UTC — never the viewer's zone (§5.4). */
export function formatUtcDate(iso: string, options: Intl.DateTimeFormatOptions = LONG_DATE): string {
  let formatter = utcFormatters.get(options);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
    utcFormatters.set(options, formatter);
  }
  return formatter.format(new Date(iso));
}

/**
 * Display a real moment (created_at, changed_at, a note's timestamp) in the
 * viewer's own zone. The opposite rule from formatUtcDate, deliberately.
 */
export function formatMoment(iso: string): string {
  momentFormatter ??= new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  return momentFormatter.format(new Date(iso));
}

let momentFormatter: Intl.DateTimeFormat | undefined;

/**
 * Today as an <input type="date"> value — the Add form's default (§4.3).
 *
 * The user's own calendar day, not UTC's: at 8pm in California it is already
 * tomorrow in UTC, and "applied today" means the day the user is living in.
 * Once chosen, it is stored as UTC midnight of that day like any other (§5.4).
 */
export function todayDateInputValue(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
