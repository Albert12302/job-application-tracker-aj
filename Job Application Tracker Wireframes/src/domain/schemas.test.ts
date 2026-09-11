import { describe, expect, it } from 'vitest';
import { applicationFormSchema, applicationsSearchSchema, signUpSchema } from './schemas';

const valid = {
  date: '2026-09-10',
  company: 'Northwind Traders',
  position: 'Senior Frontend Engineer',
  status: 'Applied' as const,
  referral: false,
};

describe('applicationFormSchema', () => {
  it('accepts the minimum viable application', () => {
    expect(applicationFormSchema.safeParse(valid).success).toBe(true);
  });

  it('uses the SPEC copy for a missing company', () => {
    const result = applicationFormSchema.safeParse({ ...valid, company: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Company and position are required.');
    }
  });

  it('treats whitespace-only as empty, not as a value', () => {
    expect(applicationFormSchema.safeParse({ ...valid, position: ' \t\n ' }).success).toBe(false);
  });

  it('caps company at 120 characters', () => {
    expect(applicationFormSchema.safeParse({ ...valid, company: 'x'.repeat(121) }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...valid, company: 'x'.repeat(120) }).success).toBe(true);
  });

  it('rejects a date that does not exist', () => {
    expect(applicationFormSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...valid, date: '2026-13-01' }).success).toBe(false);
  });

  it('accepts a real leap day', () => {
    expect(applicationFormSchema.safeParse({ ...valid, date: '2028-02-29' }).success).toBe(true);
  });
});

describe('signUpSchema', () => {
  it('reports the email problem first', () => {
    const result = signUpSchema.safeParse({ email: 'nope', password: 'short', confirm: 'short' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Enter a valid email address.');
    }
  });

  it('requires 12 characters', () => {
    const result = signUpSchema.safeParse({
      email: 'a@example.test',
      password: 'elevenchar1',
      confirm: 'elevenchar1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Password must be at least 12 characters.');
    }
  });

  it('puts the mismatch error on the confirm field', () => {
    const result = signUpSchema.safeParse({
      email: 'a@example.test',
      password: 'correct horse battery',
      confirm: 'correct horse batery',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirm']);
    }
  });
});

describe('applicationsSearchSchema', () => {
  // A malformed URL must never blank the screen: every field falls back (§8).
  it('falls back rather than failing on garbage', () => {
    const parsed = applicationsSearchSchema.parse({
      page: 'banana',
      pageSize: '999',
      sort: 'sideways',
    });
    expect(parsed).toMatchObject({ page: 1, pageSize: 25, sort: 'date-desc', filter: 'all', q: '' });
  });

  it('accepts an empty search, so a bare route is valid', () => {
    expect(applicationsSearchSchema.parse({})).toMatchObject({ filter: 'all', page: 1 });
  });
});
