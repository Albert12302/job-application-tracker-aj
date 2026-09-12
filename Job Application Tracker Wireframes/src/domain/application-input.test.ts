import { describe, expect, it } from 'vitest';
import { emptyFormValues, toApplicationInput, toFormValues } from './application-input';
import { applicationFormSchema, applicationSchema, type Application } from './schemas';

const values = applicationFormSchema.parse({
  date: '2026-09-10',
  company: '  Northwind Traders ',
  position: 'Senior Frontend Engineer',
  location: 'austin, tx',
  description: '',
  status: 'Interview',
  referral: true,
});

describe('toApplicationInput', () => {
  it('stores the date as UTC midnight (§5.4)', () => {
    expect(toApplicationInput(values, []).date_applied).toBe('2026-09-10T00:00:00.000Z');
  });

  it('keeps the trimmed text the schema produced', () => {
    expect(toApplicationInput(values, []).company).toBe('Northwind Traders');
  });

  it('normalizes the location against the other applications (§5.2)', () => {
    expect(toApplicationInput(values, []).location).toBe('Austin, TX');
    expect(toApplicationInput(values, ['Austin, Tx']).location).toBe('Austin, Tx');
  });

  it('writes null, not an empty string, for blank optional fields', () => {
    const input = toApplicationInput({ ...values, location: '   ', description: '' }, []);
    expect(input.location).toBeNull();
    expect(input.description).toBeNull();
  });

  it('carries status and referral through unchanged', () => {
    expect(toApplicationInput(values, [])).toMatchObject({ status: 'Interview', referral: true });
  });

  it('never carries the first note, which is not a column', () => {
    expect(toApplicationInput({ ...values, note: 'hello' }, [])).not.toHaveProperty('note');
  });
});

describe('emptyFormValues', () => {
  it('is valid apart from the two required fields', () => {
    const result = applicationFormSchema.safeParse(emptyFormValues('2026-09-10'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(['company', 'position']);
    }
  });

  it('defaults to Applied with no referral (§4.3)', () => {
    expect(emptyFormValues('2026-09-10')).toMatchObject({ status: 'Applied', referral: false, date: '2026-09-10' });
  });
});

describe('toFormValues', () => {
  const row: Application = applicationSchema.parse({
    id: 'a0000000-0000-0000-0000-000000000001',
    user_id: '11111111-1111-1111-1111-111111111111',
    date_applied: '2026-08-08T00:00:00+00:00',
    company: 'Northwind Traders',
    position: 'Senior Frontend Engineer',
    location: null,
    description: null,
    status: 'Callback',
    referral: true,
    starred: true,
    cover_letter_path: null,
    cover_letter_name: null,
    created_at: '2026-09-11T16:43:33.642123+00:00',
    updated_at: '2026-09-11T16:43:33.642123+00:00',
  });

  it('pre-fills the date as the stored calendar day, in any zone', () => {
    expect(toFormValues(row).date).toBe('2026-08-08');
  });

  it('turns nulls into empty inputs', () => {
    expect(toFormValues(row)).toMatchObject({ location: '', description: '' });
  });

  it('round-trips to the same row', () => {
    expect(toApplicationInput(applicationFormSchema.parse(toFormValues(row)), [])).toEqual({
      date_applied: '2026-08-08T00:00:00.000Z',
      company: 'Northwind Traders',
      position: 'Senior Frontend Engineer',
      location: null,
      description: null,
      status: 'Callback',
      referral: true,
    });
  });
});
