import { insertAppError } from '@/data/app-errors';

/**
 * The ONE error-reporting path (SPEC §7.7). Nothing else knows where errors go;
 * adopting GlitchTip or Sentry later is a change to this function body.
 *
 * What it refuses to carry, and how:
 * - no error message text — a Postgres or Storage message can echo the value
 *   that caused it, so only the error's name and code are kept;
 * - the stack without its first line, which in V8 is that same message;
 * - the path without its query string (`?q=` is user content);
 * - a context that is a fixed union, not an open bag, so form values have
 *   nowhere to go.
 */

export type ErrorAction =
  | 'sign_in'
  | 'sign_out'
  | 'load_profile'
  | 'load_avatar'
  | 'upload_avatar'
  | 'remove_avatar'
  | 'load_application_count'
  | 'render';

export type ErrorContext = { action: ErrorAction };

/** Identical errors within a session report once (§7.7) — a render loop would otherwise write thousands of rows. */
const reported = new Map<string, string>();

export function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return typeof error;
  const e = error as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
  const parts = [typeof e.name === 'string' ? e.name : 'Error'];
  for (const value of [e.code, e.status ?? e.statusCode]) {
    if (typeof value === 'string' || typeof value === 'number') parts.push(String(value).slice(0, 40));
  }
  return parts.join(':');
}

export function stackWithoutMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const head = error.message ? `${error.name}: ${error.message}` : error.name;
  return error.stack.startsWith(head) ? error.name + error.stack.slice(head.length) : error.stack;
}

/** Returns the report id, which the UI shows so a user can quote it (§8). */
export function reportError(error: unknown, context: ErrorContext): string {
  const message = `${context.action}:${errorCode(error)}`;
  const existing = reported.get(message);
  if (existing) return existing;

  const id = crypto.randomUUID();
  reported.set(message, id);

  insertAppError({
    id,
    message,
    stack: stackWithoutMessage(error),
    route: window.location.pathname,
    release: import.meta.env.VITE_RELEASE || null,
    user_agent: navigator.userAgent,
  }).catch(() => {
    // A failed report must never mask the error it was reporting (§7.7).
  });

  return id;
}
