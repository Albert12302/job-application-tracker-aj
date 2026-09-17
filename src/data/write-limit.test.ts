import { describe, expect, it, vi } from 'vitest';
import type { FilterCriteria } from '@/domain/filters';
import { noteRow } from '@/test/factories';
import { WriteRateLimitedError, writeFailure } from './write-limit';

/**
 * Every write says the same thing when §7.1's limit refuses it.
 *
 * The risk this covers is not the mapping — that is three lines — but a write
 * that forgets to use it. Two of them did: only the application delete and the
 * saved filters mapped the code, so starring, changing a status, editing a note
 * or deleting from the detail screen reported the refusal to `app_errors` as a
 * bug and showed the user generic copy. So the client here refuses *everything*,
 * and each write is asked what it throws.
 */

/** A PostgREST failure as `consume_rate_limit` raises it: the bare code, never the row. */
const REFUSED = { data: null, error: { message: 'rate_limited', code: '23514', details: '', hint: 'SPEC 7.1' } };

/**
 * A client whose every call chains and whose every await is the refusal — so the
 * builder each write happens to use (`update().eq().select().maybeSingle()`,
 * `insert().single()`, `rpc()`) needs no stub of its own.
 */
const refusing: unknown = new Proxy(() => refusing, {
  get: (_target, property) =>
    property === 'then' ? (resolve: (value: unknown) => unknown) => resolve(REFUSED) : () => refusing,
  apply: () => refusing,
});

vi.mock('./client', () => ({ supabase: refusing }));

const { createApplication, updateApplicationFields, setStarred, changeApplicationStatus, setCoverLetter, deleteApplicationRow } =
  await import('./applications');
const { addNote, updateNote, deleteNote, restoreNote } = await import('./notes');
const { createSavedFilter, deleteSavedFilter } = await import('./saved-filters');

const APPLICATION_ID = 'a0000000-0000-0000-0000-000000000001';
// The edit form's fields; the status is not among them, it changes on its own path (§9.1).
const FIELDS = {
  date_applied: '2026-09-08T00:00:00+00:00',
  company: 'Northwind Traders',
  position: 'Senior Frontend Engineer',
  location: 'Austin, TX',
  description: null,
  referral: false,
} as const;
const INPUT = { ...FIELDS, status: 'Applied' } as const;
const COVER_LETTER = { path: '11111111-1111-1111-1111-111111111111/c.pdf', name: 'cover-letter.pdf' };
const SAVED_FILTER: FilterCriteria & { name: string } = {
  name: 'Live',
  statuses: [],
  location: null,
  referral: 'any',
  starred: 'any',
  text: '',
};

describe('a refused write', () => {
  const writes: [string, () => Promise<unknown>][] = [
    ['createApplication', () => createApplication(INPUT, null)],
    ['updateApplicationFields', () => updateApplicationFields(APPLICATION_ID, FIELDS)],
    ['setStarred', () => setStarred(APPLICATION_ID, true)],
    ['changeApplicationStatus', () => changeApplicationStatus(APPLICATION_ID, 'Interview')],
    ['setCoverLetter', () => setCoverLetter(APPLICATION_ID, COVER_LETTER, null)],
    ['deleteApplicationRow', () => deleteApplicationRow(APPLICATION_ID)],
    ['addNote', () => addNote(APPLICATION_ID, 'Recruiter screen went well.')],
    ['updateNote', () => updateNote(noteRow().id, 'Edited.')],
    ['deleteNote', () => deleteNote(noteRow().id)],
    ['restoreNote', () => restoreNote(noteRow({ application_id: APPLICATION_ID }))],
    ['createSavedFilter', () => createSavedFilter(SAVED_FILTER)],
    ['deleteSavedFilter', () => deleteSavedFilter(APPLICATION_ID)],
  ];

  it.each(writes)('is what %s throws, so the user is asked to wait rather than reported (§7.1)', async (_name, run) => {
    await expect(run()).rejects.toBeInstanceOf(WriteRateLimitedError);
  });
});

describe('writeFailure', () => {
  it('keeps the original as the cause, so the report path still has it if one is ever wanted', () => {
    const raw = { message: 'rate_limited' };
    expect((writeFailure(raw) as WriteRateLimitedError).cause).toBe(raw);
  });

  it('passes every other failure through untouched — a real bug must still be reported', () => {
    const raw = { message: 'duplicate key value violates unique constraint' };
    expect(writeFailure(raw)).toBe(raw);
  });
});
