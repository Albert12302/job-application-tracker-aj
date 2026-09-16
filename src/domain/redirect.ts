/**
 * Where sign-in sends the user afterwards (SPEC §8.2 "Session expired": return
 * to the previous screen after sign-in).
 *
 * The target arrives in the URL, so anyone can craft it. Only same-app paths
 * are allowed: `//evil.test` and `/\evil.test` are protocol-relative in
 * browsers, and anything with a scheme leaves the app. An open redirect on the
 * sign-in page is a phishing kit.
 */
export const DEFAULT_AFTER_SIGN_IN = '/applications';

// Browsers strip tabs and newlines from URLs, which turns "/\t/evil.test" into "//evil.test".
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

export function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/')) return DEFAULT_AFTER_SIGN_IN;
  if (target.startsWith('//') || target.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN;
  if (CONTROL_CHARACTERS.test(target)) return DEFAULT_AFTER_SIGN_IN;
  if (target === '/sign-in' || target.startsWith('/sign-in?') || target.startsWith('/sign-in/')) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return target;
}
