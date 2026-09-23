import { AuthError, FunctionsHttpError, type Session } from '@supabase/supabase-js';
import { signInLockedBodySchema, signInResponseSchema } from '@/domain/schemas';
import { AUTH_STORAGE_KEY, createRecoveryClient, supabase } from './client';
import { logSecurityEvent } from './security-events';

/**
 * Sign-in, sign-out, password reset, and the session as the rest of the app
 * sees it.
 *
 * Sign-in goes through the `sign-in` edge function, never
 * `supabase.auth.signInWithPassword` — the function owns the per-account
 * lockout (SPEC §7.1), and calling Auth directly would walk around it.
 *
 * The reset (§4.1c–d) is here for the same reason sign-in is: it is the one
 * place that decides what a credential does, and it deliberately does *not*
 * touch the session store — see `recoveryLink` below.
 */

export type SessionUser = { id: string; email: string | null };

/**
 * `reason` separates the three ways to be signed out, because §8.2 treats them
 * differently: only an expired session gets "Your session expired" and a
 * return trip to where the user was.
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'signed-out'; reason: 'none' | 'signed-out' | 'expired' };

let state: SessionState = { status: 'loading' };
// Outlives sign-out, so screens still mounted during the redirect to /sign-in
// render with the old identity instead of crashing. Their queries are disabled
// by then, and main.tsx clears the cache.
let lastUser: SessionUser | null = null;
let signOutRequested = false;
const listeners = new Set<() => void>();

function publish(next: SessionState) {
  state = next;
  if (next.status === 'signed-in') lastUser = next.user;
  for (const listener of listeners) listener();
}

function sameUser(session: Session): boolean {
  return (
    state.status === 'signed-in' &&
    state.user.id === session.user.id &&
    state.user.email === (session.user.email ?? null)
  );
}

/**
 * Whether this page load began with a stored session. Read synchronously,
 * before supabase-js (which restores asynchronously, after a refresh round
 * trip) can remove it. A stored session that does not come back is an expired
 * one — decided from this, not from the order auth-js reports it in, which
 * differs between Chromium and WebKit.
 */
const startedWithStoredSession = (() => {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false; // storage blocked: nothing could have been stored either
  }
})();

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    // A token refresh changes nothing the app renders; keep the same object.
    if (!sameUser(session)) {
      publish({ status: 'signed-in', user: { id: session.user.id, email: session.user.email ?? null } });
    }
    return;
  }

  // One sign-out can be reported twice (SIGNED_OUT and INITIAL_SESSION); the first classified it.
  if (state.status === 'signed-out') return;

  const hadSession = state.status === 'signed-in' || (state.status === 'loading' && startedWithStoredSession);
  const reason = signOutRequested ? 'signed-out' : hadSession ? 'expired' : 'none';
  signOutRequested = false;
  publish({ status: 'signed-out', reason });
});

/** For useSyncExternalStore. */
export const sessionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: (): SessionState => state,
  lastUser: (): SessionUser | null => lastUser,
};

export type SignInFailure = 'missing' | 'invalid' | 'locked' | 'unavailable';

/** An expected sign-in outcome, not a bug — only `unavailable` is worth reporting. */
export class SignInError extends Error {
  readonly reason: SignInFailure;
  /** For `locked`: how long the function said to wait, when it said. */
  readonly retryAfterMinutes: number | undefined;

  constructor(reason: SignInFailure, options?: { cause?: unknown; retryAfterMinutes?: number | undefined }) {
    super(`sign_in_${reason}`, { cause: options?.cause });
    this.name = 'SignInError';
    this.reason = reason;
    this.retryAfterMinutes = options?.retryAfterMinutes;
  }
}

const FAILURE_BY_STATUS: Record<number, SignInFailure> = { 400: 'missing', 401: 'invalid', 429: 'locked' };

/** The wait from a 429 body. A body that is missing or malformed just means "later". */
async function lockoutMinutes(response: Response): Promise<number | undefined> {
  try {
    return signInLockedBodySchema.parse(await response.json()).retryAfterMinutes;
  } catch {
    return undefined;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('sign-in', { body: { email, password } });

  if (error) {
    // The function's status is the contract (supabase/functions/sign-in/README.md);
    // its body copy is not rendered, so the client owns every word it shows. The
    // one thing read from a body is the lockout's wait, a validated number.
    const response = error instanceof FunctionsHttpError && error.context instanceof Response ? error.context : null;
    const reason = FAILURE_BY_STATUS[response?.status ?? 0] ?? 'unavailable';
    const retryAfterMinutes = reason === 'locked' && response ? await lockoutMinutes(response) : undefined;
    throw new SignInError(reason, { cause: error, retryAfterMinutes });
  }

  const parsed = signInResponseSchema.safeParse(data);
  if (!parsed.success) throw new SignInError('unavailable', { cause: parsed.error });

  const { error: sessionError } = await supabase.auth.setSession(parsed.data.session);
  if (sessionError) throw new SignInError('unavailable', { cause: sessionError });
}

/**
 * Ends this device's session and revokes its refresh token server-side
 * (SPEC §7.1) — `local` scope, because signing out of a phone should not sign
 * out the laptop. Signing out everywhere is the password-change path.
 *
 * auth-js drops the local session even when the revoke call fails, so an error
 * here means "signed out locally, server not told" — the caller reports it.
 */
export async function signOut(): Promise<void> {
  signOutRequested = true;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } finally {
    signOutRequested = false;
  }
}

/* ------------------------------------------------------------------------- *
 * Password reset (SPEC §4.1c–d)
 * ------------------------------------------------------------------------- */

/**
 * What this page load arrived with in its fragment.
 *
 * A recovery link carries a real session, so the whole design of this half of
 * the file is about not letting it become one. supabase-js would adopt it
 * (`detectSessionInUrl`), which would sign the visitor in before they had set
 * a password and hand them the app through the router guards. Instead the
 * fragment is read here, synchronously at module load — the same reason
 * `startedWithStoredSession` is — and the tokens are spent on one request by a
 * client that stores nothing.
 */
export type RecoveryLink =
  | { status: 'ready'; accessToken: string; refreshToken: string }
  /** The link was used already, or its 60 minutes are up (§7.1). */
  | { status: 'invalid' }
  /** No link: someone typed the address. */
  | { status: 'none' };

export const recoveryLink: RecoveryLink = (() => {
  try {
    const fragment = window.location.hash.slice(1);
    // The skip link's `#main` is a fragment too, and stripping it would break
    // it (§10.2) — so only a fragment that is plainly an auth answer is read
    // or removed.
    if (!fragment.includes('=')) return { status: 'none' };
    const params = new URLSearchParams(fragment);
    const isRecovery = params.get('type') === 'recovery';
    const failed = params.get('error_code') !== null;
    if (!isRecovery && !failed) return { status: 'none' };

    // Out of the address bar, history, and anything that reads either, before
    // the app renders. Nothing else needs it: it lives in this module now.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (failed || !isRecovery || !accessToken || !refreshToken) return { status: 'invalid' };
    return { status: 'ready', accessToken, refreshToken };
  } catch {
    return { status: 'none' };
  }
})();

export type PasswordResetFailure = 'invalid-link' | 'same-password' | 'weak-password' | 'unavailable';

/** An expected reset outcome, not a bug — only `unavailable` is worth reporting. */
export class PasswordResetError extends Error {
  readonly reason: PasswordResetFailure;

  constructor(reason: PasswordResetFailure, options?: { cause?: unknown }) {
    super(`password_reset_${reason}`, { cause: options?.cause });
    this.name = 'PasswordResetError';
    this.reason = reason;
  }
}

/**
 * Whether Auth never answered at all — a dropped connection, a gateway that
 * would not talk, a retryable 5xx.
 *
 * Matched on the class rather than the status, and the difference is the whole
 * point: auth-js gives a failed fetch `status: 0`, which is a *number*, so a
 * check for "has a numeric status" quietly treats a dead connection as an
 * answer. It builds this same class for retryable 5xx too, with a real status,
 * and those are equally not answers.
 *
 * By name because supabase-js re-exports neither the class nor its type guard;
 * auth-js's own `isAuthRetryableFetchError` is this exact comparison.
 */
function unanswered(error: unknown): boolean {
  return !(error instanceof AuthError) || error.name === 'AuthRetryableFetchError';
}

/**
 * Ask Auth to send a reset link (§4.1c).
 *
 * It resolves for an address with an account and one without, and so does
 * Auth — that is §7.1's "no account enumeration", and it is why nothing here
 * inspects the answer beyond whether Auth gave one. An address Auth refused for
 * its own reasons (its send limit, §7.1's "silently succeed, send nothing")
 * resolves too: a caller learns only that the request was made. A *transport*
 * failure throws, because "we could not ask" says nothing about the address and
 * leaving the user with a confirmation for an email that was never requested is
 * the one genuinely misleading outcome.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error && unanswered(error)) throw error;
}

/** Auth's codes for the outcomes a user can do something about. */
const RESET_FAILURE_BY_CODE: Record<string, PasswordResetFailure> = {
  same_password: 'same-password',
  weak_password: 'weak-password',
  session_expired: 'invalid-link',
  session_not_found: 'invalid-link',
  bad_jwt: 'invalid-link',
  reauthentication_needed: 'invalid-link',
};

function resetFailure(error: AuthError): PasswordResetFailure {
  const byCode = error.code ? RESET_FAILURE_BY_CODE[error.code] : undefined;
  if (byCode) return byCode;
  // auth-js raises this one itself, with no code and a 400, when the session
  // the link opened has gone — so it is matched by name or it would fall
  // through to `unavailable` and be reported as a bug. (The codes above stay:
  // Auth sends them on its own responses.)
  if (error.name === 'AuthSessionMissingError') return 'invalid-link';
  // A refused token reads as 401/403 whatever code came with it.
  return error.status === 401 || error.status === 403 ? 'invalid-link' : 'unavailable';
}

/**
 * Set the password the link was sent for (§4.1d), then end every session the
 * account has — including the link's own, which is why this returns to
 * sign-in rather than into the app.
 *
 * The client here is built for this one call and stores nothing, so the
 * recovery token never reaches `AUTH_STORAGE_KEY` and the app's own session is
 * untouched throughout. `password_reset_complete` is written before the
 * sign-out, while there is still a user to attribute it to (§7.7) — and never
 * at the cost of the reset, which by then has already happened.
 */
export async function setPasswordWithRecovery(
  link: Extract<RecoveryLink, { status: 'ready' }>,
  password: string,
): Promise<void> {
  const client = createRecoveryClient();

  const { error: sessionError } = await client.auth.setSession({
    access_token: link.accessToken,
    refresh_token: link.refreshToken,
  });
  if (sessionError) throw new PasswordResetError('invalid-link', { cause: sessionError });

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    throw error instanceof AuthError
      ? new PasswordResetError(resetFailure(error), { cause: error })
      : new PasswordResetError('unavailable', { cause: error });
  }

  await logSecurityEvent('password_reset_complete', 'success', client).catch(() => {
    // §7.7's log is not worth undoing a password the user has already changed.
  });

  // §4.1d: saving signs out every other device. `global`, so the promise on
  // screen is the one Auth carries out — and so the link's own session, which
  // is a live credential until this call, stops being one.
  //
  // A failure here is not reported and does not fail the reset: the password
  // has already changed, and telling the user it did not would be false. What
  // it leaves is other devices holding refresh tokens that outlive the
  // password until the §7.1 session job reaches them — recorded as an accepted
  // residual there rather than silently. Nothing is left behind on *this*
  // device either way: the client stores nothing, and auth-js drops its local
  // session whether or not the revoke lands.
  await client.auth.signOut({ scope: 'global' }).catch(() => {});
}
