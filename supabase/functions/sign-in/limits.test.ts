import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LOCKOUT_MS,
  accountLockout,
  authFailure,
  backoffMs,
  clientIp,
  IP_DEFAULT_MAX_FAILURES,
  IP_WINDOW_MS,
  ipBlockedUntil,
  MINUTE,
  parseLimit,
  retryAfterMinutes,
} from './limits.ts';

const NOW = 1_000_000_000_000;
/** Failure times `minutesAgo` each, newest first. */
const ago = (...minutesAgo: number[]) => minutesAgo.map((m) => NOW - m * MINUTE);

describe('accountLockout (§7.1: 5 failures / 15 min, then 15 min)', () => {
  it('stays open below five failures', () => {
    expect(accountLockout(ago(1, 2, 3, 4), NOW)).toEqual({ inWindow: 4, lockedUntil: 0 });
  });

  it('locks for 15 minutes from the fifth failure', () => {
    const times = ago(1, 2, 3, 4, 5);
    expect(accountLockout(times, NOW).lockedUntil).toBe(times[0]! + ACCOUNT_LOCKOUT_MS);
  });

  it('locks the full 15 minutes even when the first failure is about to age out', () => {
    // The bug this replaced: the lock ended when the oldest failure left the window.
    const times = ago(0, 1, 2, 3, 14);
    expect(accountLockout(times, NOW).lockedUntil).toBe(NOW + ACCOUNT_LOCKOUT_MS);
  });

  it('does not lock when the five failures span more than 15 minutes', () => {
    expect(accountLockout(ago(0, 1, 2, 3, 16), NOW).lockedUntil).toBe(0);
  });

  it('unlocks once 15 minutes have passed since the fifth', () => {
    expect(accountLockout(ago(15, 16, 17, 18, 19), NOW).lockedUntil).toBe(0);
  });
});

describe('backoffMs', () => {
  it('doubles from 250 ms', () => {
    expect([0, 1, 2, 3, 4].map(backoffMs)).toEqual([0, 250, 500, 1000, 2000]);
  });
});

describe('ipBlockedUntil (§7.1: 20 failures / hour, temporary block)', () => {
  const twenty = Array.from({ length: IP_DEFAULT_MAX_FAILURES }, (_, i) => NOW - (i + 1) * MINUTE);

  it('stays open at 19 failures in the hour', () => {
    expect(ipBlockedUntil(twenty.slice(0, 19), NOW, IP_DEFAULT_MAX_FAILURES)).toBe(0);
  });

  it('blocks at 20, until the oldest of them is an hour old', () => {
    expect(ipBlockedUntil(twenty, NOW, IP_DEFAULT_MAX_FAILURES)).toBe(twenty[19]! + IP_WINDOW_MS);
  });

  it('ignores failures older than an hour', () => {
    const stale = [...twenty.slice(0, 19), NOW - 61 * MINUTE];
    expect(ipBlockedUntil(stale, NOW, IP_DEFAULT_MAX_FAILURES)).toBe(0);
  });

  it('honours a configured limit', () => {
    expect(ipBlockedUntil(ago(1, 2, 3), NOW, 3)).toBe(NOW - 3 * MINUTE + IP_WINDOW_MS);
  });
});

describe('authFailure (§7.1: only Auth rejecting the credentials counts)', () => {
  it('counts a credential rejection', () => {
    expect(authFailure(400)).toBe('rejected');
  });

  it('reports Auth rate limiting without counting it', () => {
    expect(authFailure(429)).toBe('rate-limited');
  });

  it('never counts a request that did not reach Auth', () => {
    // supabase-js reports status 0 for a network failure. It used to fall through to
    // "wrong password", so a few blips could lock out a real user.
    expect(authFailure(0)).toBe('unavailable');
  });

  it('never counts Auth erroring, or no session with no status', () => {
    expect(authFailure(500)).toBe('unavailable');
    expect(authFailure(503)).toBe('unavailable');
    expect(authFailure(undefined)).toBe('unavailable');
  });
});

describe('retryAfterMinutes', () => {
  it('rounds up and never says zero', () => {
    expect(retryAfterMinutes(NOW + 14.2 * MINUTE, NOW)).toBe(15);
    expect(retryAfterMinutes(NOW + 1000, NOW)).toBe(1);
    expect(retryAfterMinutes(NOW, NOW)).toBe(1);
  });
});

describe('clientIp', () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  // The headers the hosted project delivered on 2026-09-18: no x-real-ip, and a last
  // x-forwarded-for entry that is a load balancer, different on every request.
  it('hosted: trusts cf-connecting-ip, never the load balancer at the end of x-forwarded-for', () => {
    const hosted = (balancer: string) =>
      headers({
        'cf-connecting-ip': '198.51.100.7',
        'x-forwarded-for': `198.51.100.7,198.51.100.7, ${balancer}`,
        'true-client-ip': '192.0.2.55',
      });
    expect(clientIp(hosted('13.248.108.171'))).toBe('198.51.100.7');
    expect(clientIp(hosted('13.248.108.147'))).toBe('198.51.100.7');
  });

  it('never trusts true-client-ip, which hosted passes through from the caller', () => {
    expect(clientIp(headers({ 'true-client-ip': '192.0.2.55', 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('locally: trusts x-real-ip, which Kong overwrites', () => {
    expect(clientIp(headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.9, 198.51.100.7' }))).toBe(
      '198.51.100.7',
    );
  });

  it('locally, otherwise takes the last x-forwarded-for entry — the ones before it are client claims', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('falls back to one shared bucket rather than no limit', () => {
    expect(clientIp(headers({}))).toBe('unknown');
  });
});

describe('parseLimit', () => {
  it('reads a positive whole number', () => {
    expect(parseLimit('200', 20)).toBe(200);
  });

  it.each([undefined, '', '0', '-5', '2.5', 'lots'])('falls back on %j, so garbage never disables the limit', (v) => {
    expect(parseLimit(v, 20)).toBe(20);
  });
});
