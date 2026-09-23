import { describe, expect, it } from 'vitest';
import {
  applicationFormSchema,
  applicationIdSchema,
  applicationSchema,
  applicationsSearchSchema,
  forgotPasswordSchema,
  noteSchema,
  profileNameSchema,
  resetPasswordSchema,
  savedFilterFormSchema,
  signInSearchSchema,
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
    expect(parsed).toMatchObject({ page: 1, pageSize: 10, sort: 'date-desc', filter: 'all', q: '' });
  });

  it('reads the page, the three page sizes, and both orders from their URL strings', () => {
    for (const size of ['10', '25', '50']) {
      expect(applicationsSearchSchema.parse({ pageSize: size }).pageSize).toBe(Number(size));
    }
    expect(applicationsSearchSchema.parse({ page: '3', sort: 'date-asc' })).toMatchObject({ page: 3, sort: 'date-asc' });
  });

  it('falls back on a page below 1 or a fraction, and a size that is not offered', () => {
    expect(applicationsSearchSchema.parse({ page: '0' }).page).toBe(1);
    expect(applicationsSearchSchema.parse({ page: '2.5' }).page).toBe(1);
    expect(applicationsSearchSchema.parse({ pageSize: '20' }).pageSize).toBe(10);
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
  const blank = { name: '', statuses: ['Applied'], referral: 'any', starred: 'any', location: null, text: '' };

  it('accepts a blank name — it is filled in on save', () => {
    expect(savedFilterFormSchema.safeParse(blank).success).toBe(true);
  });

  it('needs at least one status, with the copy', () => {
    const result = savedFilterFormSchema.safeParse({ ...blank, statuses: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Choose at least one status.');
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

describe('profileNameSchema', () => {
  it('accepts an empty name — that is how a name is cleared (§4.6), not a failure', () => {
    expect(profileNameSchema.safeParse({ name: '' }).success).toBe(true);
  });

  it('trims, so surrounding spaces never become the stored name', () => {
    expect(profileNameSchema.parse({ name: '  Albert  ' }).name).toBe('Albert');
  });

  it('treats an all-spaces name as empty, so it clears rather than storing blanks', () => {
    expect(profileNameSchema.parse({ name: '   ' }).name).toBe('');
  });

  it('caps at 120 characters, where the column caps, with the copy', () => {
    const result = profileNameSchema.safeParse({ name: 'x'.repeat(121) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Keep this under 120 characters.');
    expect(profileNameSchema.safeParse({ name: 'x'.repeat(120) }).success).toBe(true);
  });

  it('counts the trimmed length, so spaces cannot push a valid name over the cap', () => {
    expect(profileNameSchema.safeParse({ name: `  ${'x'.repeat(120)}  ` }).success).toBe(true);
  });
});

describe('forgotPasswordSchema', () => {
  it('asks for an address that could be one (§4.1c)', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'not an email' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Enter a valid email address.');
  });

  it('trims, so a pasted address with a trailing space still gets its link', () => {
    expect(forgotPasswordSchema.parse({ email: '  dev-a@example.test ' }).email).toBe('dev-a@example.test');
  });

  it('caps at 254 characters, where the address column does', () => {
    const long = `${'x'.repeat(250)}@e.test`;
    expect(forgotPasswordSchema.safeParse({ email: long }).success).toBe(false);
  });
});

describe('resetPasswordSchema', () => {
  const ok = { password: 'correct horse battery', confirm: 'correct horse battery' };

  it('accepts a passphrase of at least 12 characters', () => {
    expect(resetPasswordSchema.safeParse(ok).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'x'.repeat(12), confirm: 'x'.repeat(12) }).success).toBe(true);
  });

  it('gives §7.1 policy failures the same words sign-up does (§4.1d)', () => {
    const short = resetPasswordSchema.safeParse({ password: 'short', confirm: 'short' });
    const shortSignUp = signUpSchema.safeParse({ email: 'a@b.test', password: 'short', confirm: 'short' });
    expect(short.success).toBe(false);
    if (!short.success && !shortSignUp.success) {
      expect(short.error.issues[0]?.message).toBe('Password must be at least 12 characters.');
      expect(short.error.issues[0]?.message).toBe(shortSignUp.error.issues[0]?.message);
    }
  });

  it('caps at 128, where §7.1 does', () => {
    const long = 'x'.repeat(129);
    expect(resetPasswordSchema.safeParse({ password: long, confirm: long }).success).toBe(false);
  });

  it('flags a mismatch on the confirm field, so the message points at the field to fix', () => {
    const result = resetPasswordSchema.safeParse({ password: 'correct horse battery', confirm: 'correct horse' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Those passwords don't match.");
      expect(result.error.issues[0]?.path).toEqual(['confirm']);
    }
  });

  it('checks the length before the match, so a short pair says what is actually wrong', () => {
    const result = resetPasswordSchema.safeParse({ password: 'short', confirm: 'other' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Password must be at least 12 characters.');
  });
});

describe('signInSearchSchema', () => {
  it('reads the banner flags §4.1d and §9.7 arrive with', () => {
    expect(signInSearchSchema.parse({ reset: true }).reset).toBe(true);
    expect(signInSearchSchema.parse({}).reset).toBeUndefined();
  });

  it('falls back rather than failing on a hand-edited flag (§8)', () => {
    expect(signInSearchSchema.parse({ reset: 'yes' }).reset).toBeUndefined();
  });
});
