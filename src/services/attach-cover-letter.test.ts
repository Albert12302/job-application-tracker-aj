import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadRefusedError } from '@/data/storage';
import { applicationRow } from '@/test/factories';
import { attachCoverLetter, CoverLetterRejectedError } from './attach-cover-letter';
import { removeCoverLetter } from './remove-cover-letter';

/**
 * The order these services do things in is the rule (SPEC §9.4): the old file
 * goes only after the new one commits, a new file nothing points at does not
 * survive, and a removal lets go of the row before the object. Every step is a
 * stub that records itself, so the tests read the order back.
 */

const calls: string[] = [];
const uploadFile = vi.fn();
const setCoverLetter = vi.fn();
const removeCoverLetterObject = vi.fn();
const reportError = vi.fn();

vi.mock('@/data/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/storage')>()),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  removeCoverLetterObject: (...args: unknown[]) => removeCoverLetterObject(...args),
}));
vi.mock('@/data/applications', () => ({ setCoverLetter: (...args: unknown[]) => setCoverLetter(...args) }));
vi.mock('@/data/security-events', () => ({ logSecurityEvent: async () => calls.push('log') }));
vi.mock('@/data/client', () => ({ supabase: {} }));
vi.mock('./report-error', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

const APP = 'a0000000-0000-0000-0000-000000000001';
const OLD = '11111111-1111-1111-1111-111111111111/old.pdf';
const NEW = '11111111-1111-1111-1111-111111111111/new.pdf';

/** A PDF by its signature, optionally padded out to `size` bytes. */
const pdf = (name = 'Cover letter.pdf', size?: number) => {
  const head = '%PDF-1.4 letter';
  return new File(size === undefined ? [head] : [head, new Uint8Array(size - head.length)], name);
};

beforeEach(() => {
  calls.length = 0;
  uploadFile.mockReset().mockImplementation(async () => {
    calls.push('upload');
    return NEW;
  });
  setCoverLetter.mockReset().mockImplementation(async (_id, next: { path: string; name: string } | null) => {
    calls.push(next ? `point at ${next.path}` : 'clear');
    return applicationRow({ id: APP, cover_letter_path: next?.path ?? null, cover_letter_name: next?.name ?? null });
  });
  removeCoverLetterObject.mockReset().mockImplementation(async (path: string) => {
    calls.push(`delete ${path}`);
  });
  reportError.mockReset();
});

describe('attachCoverLetter', () => {
  it('attaches: upload, then point the row at it, guarded on there being none', async () => {
    const saved = await attachCoverLetter(APP, pdf(), null);

    expect(calls).toEqual(['upload', `point at ${NEW}`]);
    expect(setCoverLetter).toHaveBeenCalledWith(APP, { path: NEW, name: 'Cover letter.pdf' }, null);
    expect(saved.cover_letter_path).toBe(NEW);
  });

  it('replaces: the old file is deleted only after the row points at the new one (§9.4)', async () => {
    await attachCoverLetter(APP, pdf(), OLD);

    expect(calls).toEqual(['upload', `point at ${NEW}`, `delete ${OLD}`, 'log']);
    expect(setCoverLetter).toHaveBeenCalledWith(APP, expect.anything(), OLD);
  });

  it('stores the name as a label: no path, no direction override', async () => {
    await attachCoverLetter(APP, pdf('C:\\fakepath\\letter\u202efdp.exe'), null);
    expect(setCoverLetter.mock.calls[0]?.[1]).toEqual({ path: NEW, name: 'letterfdp.exe' });
  });

  it('keeps the old file, and removes the new one, when the row cannot be updated', async () => {
    setCoverLetter.mockRejectedValue(new Error('network'));

    await expect(attachCoverLetter(APP, pdf(), OLD)).rejects.toThrow('network');
    expect(calls).toEqual(['upload', `delete ${NEW}`]);
    expect(removeCoverLetterObject).not.toHaveBeenCalledWith(OLD);
  });

  it('reports a new file it could not clean up, and still fails with the original error', async () => {
    setCoverLetter.mockRejectedValue(new Error('network'));
    removeCoverLetterObject.mockRejectedValue(new Error('storage down'));

    await expect(attachCoverLetter(APP, pdf(), null)).rejects.toThrow('network');
    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'storage down' }), {
      action: 'attach_cover_letter',
    });
  });

  it('counts the replace as done when only the old file’s delete fails — and reports the orphan', async () => {
    removeCoverLetterObject.mockRejectedValue(new Error('storage down'));

    const saved = await attachCoverLetter(APP, pdf(), OLD);
    expect(saved.cover_letter_path).toBe(NEW);
    expect(reportError).toHaveBeenCalledWith(expect.anything(), { action: 'remove_cover_letter' });
  });

  it('refuses a file by its bytes before anything is uploaded', async () => {
    const html = new File(['<!doctype html><script>alert(1)</script>'], 'letter.pdf');

    await expect(attachCoverLetter(APP, html, null)).rejects.toThrow(CoverLetterRejectedError);
    await expect(attachCoverLetter(APP, html, null)).rejects.toMatchObject({
      userMessage: 'Choose a PDF, DOC, or DOCX file.',
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB before anything is uploaded', async () => {
    await expect(attachCoverLetter(APP, pdf('big.pdf', 10 * 1024 * 1024 + 1), null)).rejects.toMatchObject({
      userMessage: 'Choose a file of 10 MB or less.',
    });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('turns the function’s refusals into the same copy, and touches no row', async () => {
    uploadFile.mockRejectedValueOnce(new UploadRefusedError('type'));
    await expect(attachCoverLetter(APP, pdf(), OLD)).rejects.toMatchObject({
      userMessage: 'Choose a PDF, DOC, or DOCX file.',
    });

    uploadFile.mockRejectedValueOnce(new UploadRefusedError('rate_limited'));
    await expect(attachCoverLetter(APP, pdf(), OLD)).rejects.toMatchObject({
      userMessage: "You've uploaded a lot of files recently. Try again in an hour.",
    });

    expect(setCoverLetter).not.toHaveBeenCalled();
    expect(removeCoverLetterObject).not.toHaveBeenCalled();
  });

  it('passes an unexpected upload failure through as itself, to be reported', async () => {
    uploadFile.mockRejectedValue(new Error('network'));
    await expect(attachCoverLetter(APP, pdf(), null)).rejects.not.toBeInstanceOf(CoverLetterRejectedError);
  });
});

describe('removeCoverLetter', () => {
  it('lets go of the row first, guarded on the file it is removing, then deletes the object', async () => {
    const saved = await removeCoverLetter(APP, OLD);

    expect(calls).toEqual(['clear', `delete ${OLD}`, 'log']);
    expect(setCoverLetter).toHaveBeenCalledWith(APP, null, OLD);
    expect(saved.cover_letter_path).toBeNull();
  });

  it('deletes nothing when the row cannot be updated', async () => {
    setCoverLetter.mockRejectedValue(new Error('network'));

    await expect(removeCoverLetter(APP, OLD)).rejects.toThrow('network');
    expect(removeCoverLetterObject).not.toHaveBeenCalled();
  });

  it('counts the removal as done when only the object delete fails — and reports the orphan', async () => {
    removeCoverLetterObject.mockRejectedValue(new Error('storage down'));

    await expect(removeCoverLetter(APP, OLD)).resolves.toMatchObject({ cover_letter_path: null });
    expect(reportError).toHaveBeenCalledWith(expect.anything(), { action: 'remove_cover_letter' });
  });
});
