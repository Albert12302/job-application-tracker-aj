import { describe, expect, it } from 'vitest';
import { ReportedError } from '@/queries/errors';
import { AccountDeletionError } from '@/services/delete-account';
import {
  deletionFailureMessage,
  deletionProgressLabel,
  deletionSummarySentence,
  emailMatches,
  failedDeletionStage,
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

describe('failedDeletionStage', () => {
  it('reads the stage through the ReportedError that reporting() wraps it in', () => {
    // The service's error never arrives bare: queries/errors.ts wraps every
    // failure, so testing the outer error for AccountDeletionError finds nothing.
    const reported = new ReportedError('abcd1234', new AccountDeletionError('account'));

    expect(failedDeletionStage(reported, null)).toBe('account');
    expect(failedDeletionStage(reported, 'files')).toBe('account');
  });

  it('reads a bare one too, for a caller that does not report', () => {
    expect(failedDeletionStage(new AccountDeletionError('files'), null)).toBe('files');
  });

  it('falls back when the failure is not the deletion service"s own', () => {
    expect(failedDeletionStage(new Error('network'), 'files')).toBe('files');
    expect(failedDeletionStage(new ReportedError('abcd1234', new Error('network')), null)).toBeNull();
    expect(failedDeletionStage(null, null)).toBeNull();
  });

  it('a stage read this way picks the copy that matches what actually happened', () => {
    const reported = new ReportedError('abcd1234', new AccountDeletionError('account'));

    expect(deletionFailureMessage(failedDeletionStage(reported, null))).toContain('Your files have been removed');
  });
});
