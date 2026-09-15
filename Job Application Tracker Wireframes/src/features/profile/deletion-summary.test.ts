import { describe, expect, it } from 'vitest';
import {
  deletionFailureMessage,
  deletionProgressLabel,
  deletionSummarySentence,
  emailMatches,
} from './deletion-summary';

/** The exact words shown before an irreversible act (SPEC §9.7). */

describe('deletionSummarySentence', () => {
  it('states what goes, as §9.7 words it', () => {
    expect(deletionSummarySentence({ applications: 7, notes: 12, files: 2 })).toBe(
      "Deletes 7 applications, 12 notes, 2 files, and this account. This can't be undone.",
    );
  });

  it('counts of one are singular', () => {
    expect(deletionSummarySentence({ applications: 1, notes: 1, files: 1 })).toBe(
      "Deletes 1 application, 1 note, 1 file, and this account. This can't be undone.",
    );
  });

  it('an empty account still says what it is deleting', () => {
    expect(deletionSummarySentence({ applications: 0, notes: 0, files: 0 })).toBe(
      "Deletes 0 applications, 0 notes, 0 files, and this account. This can't be undone.",
    );
  });

  it('loses the numbers rather than the delete when they cannot be counted (§9.2)', () => {
    expect(deletionSummarySentence(null)).toBe(
      "Deletes your applications, notes, files, and this account. This can't be undone.",
    );
  });
});

describe('deletionProgressLabel', () => {
  it('says which half is under way', () => {
    expect(deletionProgressLabel('files')).toBe('Removing your files…');
    expect(deletionProgressLabel('account')).toBe('Deleting your account…');
    // Before the first stage is reported, the first thing it will do.
    expect(deletionProgressLabel(null)).toBe('Removing your files…');
  });
});

describe('deletionFailureMessage', () => {
  it('failing on the files leaves everything intact, and says so', () => {
    expect(deletionFailureMessage('files')).toContain('It and your data are still here');
  });

  it('failing on the account admits the files are already gone, and that a retry finishes it', () => {
    const message = deletionFailureMessage('account');
    expect(message).toContain('Your files have been removed');
    expect(message).toContain('Try again to finish.');
  });
});

describe('emailMatches', () => {
  const ACCOUNT = 'dev-a@example.test';

  it('accepts the address, ignoring case and surrounding space', () => {
    expect(emailMatches(ACCOUNT, ACCOUNT)).toBe(true);
    expect(emailMatches('  DEV-A@Example.Test  ', ACCOUNT)).toBe(true);
  });

  it('refuses anything else, including near misses and the usual shortcuts', () => {
    expect(emailMatches('', ACCOUNT)).toBe(false);
    expect(emailMatches('dev-b@example.test', ACCOUNT)).toBe(false);
    expect(emailMatches('dev-a@example.tes', ACCOUNT)).toBe(false);
    expect(emailMatches('DELETE', ACCOUNT)).toBe(false);
  });

  it('an account with no address can never be confirmed, rather than confirmed by an empty box', () => {
    expect(emailMatches('', null)).toBe(false);
    expect(emailMatches('   ', null)).toBe(false);
  });
});
