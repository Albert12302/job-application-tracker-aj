import { describe, expect, it } from 'vitest';
import {
  applicationFormSchema,
  applicationIdSchema,
  applicationSchema,
  applicationsSearchSchema,
  noteSchema,
  savedFilterFormSchema,
  signUpSchema,
} from './schemas';

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

  it('caps the job description at 15,000 characters, with that number in the message', () => {
    expect(applicationFormSchema.safeParse({ ...valid, description: 'x'.repeat(15000) }).success).toBe(true);
    const over = applicationFormSchema.safeParse({ ...valid, description: 'x'.repeat(15001) });
    expect(over.success).toBe(false);
    if (!over.success) expect(over.error.issues[0]?.message).toBe('Descriptions are limited to 15,000 characters.');
  });

  it('rejects a date that does not exist', () => {
    expect(applicationFormSchema.safeParse({ ...valid, date: '2026-02-30' }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...valid, date: '2026-13-01' }).success).toBe(false);
  });

  it('accepts a real leap day', () => {
    expect(applicationFormSchema.safeParse({ ...valid, date: '2028-02-29' }).success).toBe(true);
  });
});

describe('applicationFormSchema, first note and date', () => {
  it('caps the first note at 2,000 characters', () => {
    expect(applicationFormSchema.safeParse({ ...valid, note: 'x'.repeat(2001) }).success).toBe(false);
    expect(applicationFormSchema.safeParse({ ...valid, note: 'x'.repeat(2000) }).success).toBe(true);
  });

  it('asks for a date rather than a format when the date is empty', () => {
    const result = applicationFormSchema.safeParse({ ...valid, date: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter the date you applied.');
  });
});

describe('row schemas', () => {
  // As PostgREST sends it: +00:00 offsets, microseconds, and the seed's fixed ids.
  const row = {
    id: 'a0000000-0000-0000-0000-000000000001',
    user_id: '11111111-1111-1111-1111-111111111111',
    date_applied: '2026-08-08T00:00:00+00:00',
    company: 'Northwind Traders',
    position: 'Senior Frontend Engineer',
    location: 'Austin, TX',
    description: null,
    status: 'Callback',
    referral: true,
    starred: false,
    cover_letter_path: null,
    cover_letter_name: null,
    created_at: '2026-09-11T16:43:33.642123+00:00',
    updated_at: '2026-09-11T16:43:33.642123+00:00',
  };

  it('parses an application row as the database returns it', () => {
    expect(applicationSchema.safeParse(row).success).toBe(true);
  });

  it('parses a note row as the database returns it', () => {
    const note = {
      id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      application_id: row.id,
      body: 'Recruiter screen went well.',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    expect(noteSchema.safeParse(note).success).toBe(true);
  });

  it('rejects a status outside the six (§3)', () => {
    expect(applicationSchema.safeParse({ ...row, status: 'Ghosted' }).success).toBe(false);
  });

  it('accepts only an id-shaped route param', () => {
    expect(applicationIdSchema.safeParse(row.id).success).toBe(true);
    expect(applicationIdSchema.safeParse('new').success).toBe(false);
    expect(applicationIdSchema.safeParse("1' or '1'='1").success).toBe(false);
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

  it('drops a search longer than the fields it searches, and an overlong filter', () => {
    expect(applicationsSearchSchema.parse({ q: 'x'.repeat(121), filter: 'x'.repeat(65) })).toMatchObject({
      q: '',
      filter: 'all',
    });
    expect(applicationsSearchSchema.parse({ q: 'x'.repeat(120) }).q).toHaveLength(120);
  });
});

describe('savedFilterFormSchema', () => {
  const blank = { name: '', statuses: [], referral: 'any', starred: 'any', location: null, text: '' };

  it('accepts a blank filter — the name is filled in on save', () => {
    expect(savedFilterFormSchema.safeParse(blank).success).toBe(true);
  });

  it('caps the name at 60 characters with the copy', () => {
    const result = savedFilterFormSchema.safeParse({ ...blank, name: 'x'.repeat(61) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Keep the name under 60 characters.');
    expect(savedFilterFormSchema.safeParse({ ...blank, name: 'x'.repeat(60) }).success).toBe(true);
  });

  it('caps the text match at 120 characters and rejects unknown values', () => {
    expect(savedFilterFormSchema.safeParse({ ...blank, text: 'x'.repeat(121) }).success).toBe(false);
    expect(savedFilterFormSchema.safeParse({ ...blank, statuses: ['Ghosted'] }).success).toBe(false);
    expect(savedFilterFormSchema.safeParse({ ...blank, referral: 'maybe' }).success).toBe(false);
  });
});
