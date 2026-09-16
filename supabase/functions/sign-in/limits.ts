// Sign-in limits (SPEC §7.1) as pure decisions. No imports and no Deno APIs,
// so index.ts runs exactly the code the unit tests (limits.test.ts, Vitest) cover.

export const MINUTE = 60_000;

/** Per account: five failures inside 15 minutes lock it for 15 minutes from the fifth. */
export const ACCOUNT_MAX_FAILURES = 5;
export const ACCOUNT_WINDOW_MS = 15 * MINUTE;
export const ACCOUNT_LOCKOUT_MS = 15 * MINUTE;
export const BASE_BACKOFF_MS = 250;

/** Per IP: 20 failures inside an hour block the address until the oldest of them is an hour old. */
export const IP_DEFAULT_MAX_FAILURES = 20;
export const IP_WINDOW_MS = 60 * MINUTE;

/**
 * The account decision. `failureTimes` are the account's most recent failures,
 * newest first, at most ACCOUNT_MAX_FAILURES of them. No failure is recorded
 * while locked, so the fifth failure is the clock for the whole lockout.
 */
export function accountLockout(failureTimes: number[], now: number): { inWindow: number; lockedUntil: number } {
  const inWindow = failureTimes.filter((t) => now - t <= ACCOUNT_WINDOW_MS).length;
  const newest = failureTimes[0];
  const fifth = failureTimes[ACCOUNT_MAX_FAILURES - 1];
  const until =
    newest !== undefined && fifth !== undefined && newest - fifth <= ACCOUNT_WINDOW_MS
      ? newest + ACCOUNT_LOCKOUT_MS
      : 0;
  return { inWindow, lockedUntil: until > now ? until : 0 };
}

/** Exponential backoff ahead of the account lockout: 0, 250, 500, 1000, 2000 ms. */
export function backoffMs(inWindow: number): number {
  return inWindow > 0 ? BASE_BACKOFF_MS * 2 ** (inWindow - 1) : 0;
}

/**
 * The IP decision. `failureTimes` are the address's most recent failures,
 * newest first. Blocked once `maxFailures` of them fall inside the hour; the
 * block lifts when the oldest of those ages out. Returns 0 when not blocked.
 */
export function ipBlockedUntil(failureTimes: number[], now: number, maxFailures: number): number {
  const recent = failureTimes.filter((t) => now - t < IP_WINDOW_MS);
  const oldest = recent[maxFailures - 1];
  return oldest === undefined ? 0 : oldest + IP_WINDOW_MS;
}

/** Whole minutes to wait, never zero — "try again in 0 minutes" reads as a bug. */
export function retryAfterMinutes(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / MINUTE));
}

/**
 * The caller's address as Supabase's gateway saw it. `x-real-ip` is written by
 * the gateway and replaces anything the client sent; `x-forwarded-for` is only
 * appended to, so its last entry is the gateway's own view and every entry
 * before it is whatever the client claimed. Measured locally (Kong); confirm on
 * the hosted project — see README.md "Confirm the client IP after deploy".
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  const last = headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  return last || 'unknown';
}

/** A positive whole number from the environment, or the fallback. Garbage never disables a limit. */
export function parseLimit(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
