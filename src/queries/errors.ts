import { useState } from 'react';
import { WriteRateLimitedError } from '@/data/write-limit';
import { isOffline } from '@/lib/online';
import { reportError, type ErrorAction } from '@/services/report-error';

/**
 * Where query and mutation failures meet reportError(). Components never
 * report; they read `errorReference()` to show the id (§8), and nothing else
 * about the error.
 */

export class ReportedError extends Error {
  readonly reference: string;

  constructor(reference: string, cause: unknown) {
    super('reported', { cause });
    this.name = 'ReportedError';
    this.reference = reference;
  }
}

/**
 * A request that failed with no network (SPEC §8.2 "Offline"). The connection
 * is the user's to restore, so it is never reported — and the report itself
 * could not have been written either, `app_errors` being one more request
 * (§7.7).
 */
export class OfflineError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('offline', options);
    this.name = 'OfflineError';
  }
}

/**
 * Runs `run`; an unexpected failure is reported and rethrown as a
 * ReportedError. `isExpected` lets outcomes the user can fix — a wrong
 * password, a rejected file — through untouched and unreported.
 */
export async function reporting<T>(
  action: ErrorAction,
  run: () => Promise<T>,
  isExpected: (error: unknown) => boolean = () => false,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // Before the network: a rejected file is rejected whether or not there is
    // one, and saying "you're offline" about it would be the wrong reason.
    if (isExpected(error)) throw error;
    if (isOffline()) throw new OfflineError({ cause: error });
    throw new ReportedError(reportError(error, { action }), error);
  }
}

/**
 * The write limit (§7.1): the user's to wait out, shown, and not reported.
 * Every mutation that writes passes this to `reporting`, on its own or beside
 * its other expected outcomes — a refused write is not a bug in the app.
 */
export const isRateLimited = (error: unknown) => error instanceof WriteRateLimitedError;

export const WAIT_A_MINUTE = "You've made a lot of changes in the last minute. Wait a minute, then try again.";

/** The banner says changes will not save; a failure says what to do about it (§8.2). */
export const OFFLINE = "You're offline. Check your connection and try again.";

/**
 * What a failed request says. Being offline and hitting the limit each add
 * their own line and carry no reference, because nothing was reported and
 * there is nothing to quote; every other failure keeps the plain copy (§8.1).
 */
export const failureMessage = (message: string, error: unknown) => {
  if (error instanceof OfflineError) return `${message} ${OFFLINE}`;
  return isRateLimited(error) ? `${message} ${WAIT_A_MINUTE}` : message;
};

/** The short form shown to the user; the full uuid is the row id. */
export function errorReference(error: unknown): string | null {
  return error instanceof ReportedError ? error.reference.slice(0, 8) : null;
}

/** For render errors caught by a route boundary. Reported once per error. */
export function useErrorReference(error: unknown, action: ErrorAction): string {
  const [reference] = useState(() => reportError(error, { action }).slice(0, 8));
  return reference;
}
