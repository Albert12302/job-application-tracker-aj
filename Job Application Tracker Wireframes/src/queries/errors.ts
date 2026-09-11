import { useState } from 'react';
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
    if (isExpected(error)) throw error;
    throw new ReportedError(reportError(error, { action }), error);
  }
}

/** The short form shown to the user; the full uuid is the row id. */
export function errorReference(error: unknown): string | null {
  return error instanceof ReportedError ? error.reference.slice(0, 8) : null;
}

/** For render errors caught by a route boundary. Reported once per error. */
export function useErrorReference(error: unknown, action: ErrorAction): string {
  const [reference] = useState(() => reportError(error, { action }).slice(0, 8));
  return reference;
}
