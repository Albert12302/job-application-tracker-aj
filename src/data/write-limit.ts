/**
 * The per-user write limit (SPEC §7.1), as every write reports it.
 *
 * 120 writes a minute, counted by a trigger on each of the five writable tables
 * (migration 20260910090800, and 20260921234631 for `profiles`). The trigger
 * raises a bare code — never the row's
 * content — and PostgREST hands it back as the message, the same whether the
 * write was a plain statement or one inside `create_application` /
 * `change_application_status`.
 *
 * It lives here rather than in `data/applications.ts` because it belongs to no
 * one table: applications, notes, saved filters, status history and profiles all
 * raise it.
 */

/** The write limit refused this change. The user's to wait out, so never reported (§7.7). */
export class WriteRateLimitedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('write_rate_limited', options);
    this.name = 'WriteRateLimitedError';
  }
}

/**
 * The error a write throws. Every write in `data/` passes its failure through
 * here — `if (error) throw writeFailure(error)` — so hitting the limit always
 * reaches the user as "wait a minute" (queries/errors.ts `isRateLimited`)
 * rather than as a bug in `app_errors`. A write that throws its raw error
 * instead is the bug this exists to stop; reads do not use it.
 */
export function writeFailure<E extends { message: string }>(error: E): E | WriteRateLimitedError {
  return error.message === 'rate_limited' ? new WriteRateLimitedError({ cause: error }) : error;
}
