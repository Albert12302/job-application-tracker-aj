import { describe, expect, it } from 'vitest';
import { corsHeaders, parseOrigins } from './cors.ts';

describe('parseOrigins', () => {
  it('splits, trims, and drops empties', () => {
    expect([...parseOrigins(' http://a.test , ,https://b.test,')]).toEqual(['http://a.test', 'https://b.test']);
  });

  it('is empty when unset, so nothing is allowed rather than everything', () => {
    expect(parseOrigins(undefined).size).toBe(0);
    expect(parseOrigins('').size).toBe(0);
  });
});

describe('corsHeaders', () => {
  const allowed = parseOrigins('https://app.test');

  it('echoes an allowlisted origin', () => {
    expect(corsHeaders('https://app.test', allowed)['access-control-allow-origin']).toBe('https://app.test');
  });

  it('gives any other origin no allow-origin at all — never `*`', () => {
    for (const origin of ['https://evil.test', 'https://app.test.evil.test', null]) {
      expect(corsHeaders(origin, allowed)).toEqual({ vary: 'Origin' });
    }
  });
});
