import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_LOCKOUT_MS,
  accountLockout,
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

describe('retryAfterMinutes', () => {
  it('rounds up and never says zero', () => {
    expect(retryAfterMinutes(NOW + 14.2 * MINUTE, NOW)).toBe(15);
    expect(retryAfterMinutes(NOW + 1000, NOW)).toBe(1);
    expect(retryAfterMinutes(NOW, NOW)).toBe(1);
  });
});

describe('clientIp', () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it('trusts x-real-ip, which the gateway overwrites', () => {
    expect(clientIp(headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.9, 198.51.100.7' }))).toBe(
      '198.51.100.7',
    );
  });

  it('otherwise takes the last x-forwarded-for entry — the ones before it are client claims', () => {
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
