import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_SIGN_IN, safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('keeps a same-app path, query string included', () => {
    expect(safeRedirect('/profile')).toBe('/profile');
    expect(safeRedirect('/applications?filter=Offer&page=2')).toBe('/applications?filter=Offer&page=2');
  });

  it('falls back when there is no target', () => {
    expect(safeRedirect(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirect(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirect('')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  // Each of these leaves the app in at least one browser.
  it.each([
    'https://evil.test',
    'javascript:alert(1)',
    '//evil.test',
    '/\\evil.test',
    '/\t/evil.test',
    '/\n/evil.test',
    'evil.test',
  ])('refuses %j', (target) => {
    expect(safeRedirect(target)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('never loops back to sign-in', () => {
    expect(safeRedirect('/sign-in')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeRedirect('/sign-in?expired=true')).toBe(DEFAULT_AFTER_SIGN_IN);
  });
});
