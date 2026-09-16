import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationRow, noteRow, TEST_USER } from '@/test/factories';
import { exportData, exportFilename, type ExportStage } from './export-data';

/**
 * What §9.8 promises, read back out of the zip: every application with its
 * notes and history nested, the saved filters, the profile, the files — and a
 * file that would not come named in export-errors.txt rather than taken as a
 * reason to hand the user nothing.
 */

const listApplications = vi.fn();
const listAllNotes = vi.fn();
const listStatusHistory = vi.fn();
const listSavedFilters = vi.fn();
const getProfile = vi.fn();
const downloadCoverLetter = vi.fn();
const downloadAvatar = vi.fn();
const reportError = vi.fn();

vi.mock('@/data/applications', () => ({ listApplications: (...a: unknown[]) => listApplications(...a) }));
vi.mock('@/data/notes', () => ({ listAllNotes: (...a: unknown[]) => listAllNotes(...a) }));
vi.mock('@/data/status-history', () => ({ listStatusHistory: (...a: unknown[]) => listStatusHistory(...a) }));
vi.mock('@/data/saved-filters', () => ({ listSavedFilters: (...a: unknown[]) => listSavedFilters(...a) }));
vi.mock('@/data/profile', () => ({ getProfile: (...a: unknown[]) => getProfile(...a) }));
vi.mock('@/data/storage', () => ({
  downloadCoverLetter: (...a: unknown[]) => downloadCoverLetter(...a),
  downloadAvatar: (...a: unknown[]) => downloadAvatar(...a),
}));
vi.mock('@/data/client', () => ({ supabase: {} }));
vi.mock('./report-error', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./report-error')>()),
  reportError: (...a: unknown[]) => reportError(...a),
}));

const USER = TEST_USER.id;
const LETTER = `${USER}/aaaa1111.pdf`;
const AVATAR = `${USER}/bbbb2222.png`;

const APP_A = applicationRow({ id: 'a0000000-0000-0000-0000-00000000000a', company: 'Northwind' });
const APP_B = applicationRow({
  id: 'b0000000-0000-0000-0000-00000000000b',
  company: 'Contoso',
  cover_letter_path: LETTER,
  cover_letter_name: 'Contoso letter.pdf',
});

const historyRow = (applicationId: string, to: 'Applied' | 'Interview') => ({
  application_id: applicationId,
  to_status: to,
  changed_at: '2026-09-03T10:00:00+00:00',
});

/** The zip's entries, as text where they are text. */
async function entriesOf(zip: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await zip.arrayBuffer()));
}

const readJson = (entries: Record<string, Uint8Array>, name: string): unknown =>
  JSON.parse(strFromU8(entries[name]!));

beforeEach(() => {
  listApplications.mockReset().mockResolvedValue([APP_A, APP_B]);
  listAllNotes.mockReset().mockResolvedValue([]);
  listStatusHistory.mockReset().mockResolvedValue([]);
  listSavedFilters.mockReset().mockResolvedValue([]);
  getProfile.mockReset().mockResolvedValue({ id: USER, name: 'Dev A', avatar_path: null });
  downloadCoverLetter.mockReset().mockResolvedValue(new Blob(['%PDF-1.4 letter']));
  downloadAvatar.mockReset().mockResolvedValue(new Blob(['PNG-bytes']));
  reportError.mockReset();
});

describe('exportData', () => {
  it('writes one zip holding the three JSON files (§9.8)', async () => {
    const entries = await entriesOf(await exportData(USER));

    // `files/` itself is a directory entry, which is what §9.8 asks the zip to hold.
    expect(Object.keys(entries).sort()).toEqual([
      'applications.json',
      'files/',
      'files/aaaa1111.pdf',
      'profile.json',
      'saved-filters.json',
    ]);
  });

  it('nests each application"s notes and full status history under it', async () => {
    listAllNotes.mockResolvedValue([
      noteRow({ id: 'n0000000-0000-0000-0000-00000000000a', application_id: APP_A.id, body: 'First' }),
      noteRow({ id: 'n0000000-0000-0000-0000-00000000000b', application_id: APP_A.id, body: 'Second' }),
    ]);
    listStatusHistory.mockResolvedValue([historyRow(APP_A.id, 'Applied'), historyRow(APP_B.id, 'Interview')]);

    const entries = await entriesOf(await exportData(USER));
    const applications = readJson(entries, 'applications.json') as {
      company: string;
      notes: { body: string }[];
      status_history: { to_status: string }[];
    }[];

    expect(applications).toHaveLength(2);
    expect(applications[0]!.company).toBe('Northwind');
    expect(applications[0]!.notes.map((note) => note.body)).toEqual(['First', 'Second']);
    expect(applications[0]!.status_history.map((change) => change.to_status)).toEqual(['Applied']);
    // The one with no notes still carries the empty arrays, so the shape never varies.
    expect(applications[1]!.notes).toEqual([]);
    expect(applications[1]!.status_history.map((change) => change.to_status)).toEqual(['Interview']);
  });

  it('keeps the profile and the saved filters as their own files', async () => {
    listSavedFilters.mockResolvedValue([{ id: 'f1', name: 'Live', statuses: ['Applied'] }]);

    const entries = await entriesOf(await exportData(USER));

    expect(readJson(entries, 'profile.json')).toMatchObject({ name: 'Dev A' });
    expect(readJson(entries, 'saved-filters.json')).toMatchObject([{ name: 'Live' }]);
  });

  it('puts cover letters and the avatar in files/, under their stored names', async () => {
    getProfile.mockResolvedValue({ id: USER, name: 'Dev A', avatar_path: AVATAR });

    const entries = await entriesOf(await exportData(USER));

    expect(downloadCoverLetter).toHaveBeenCalledWith(LETTER);
    expect(downloadAvatar).toHaveBeenCalledWith(AVATAR);
    expect(strFromU8(entries['files/aaaa1111.pdf']!)).toBe('%PDF-1.4 letter');
    expect(strFromU8(entries['files/bbbb2222.png']!)).toBe('PNG-bytes');
  });

  it('has no files/ entry at all when there is nothing to put in it', async () => {
    listApplications.mockResolvedValue([APP_A]);

    const entries = await entriesOf(await exportData(USER));

    expect(Object.keys(entries).some((name) => name.startsWith('files/'))).toBe(false);
    expect(downloadCoverLetter).not.toHaveBeenCalled();
  });

  it('a failed file fetch does not fail the export: it is named in export-errors.txt (§9.8)', async () => {
    getProfile.mockResolvedValue({ id: USER, name: 'Dev A', avatar_path: AVATAR });
    downloadCoverLetter.mockRejectedValue(new Error('storage_download_failed'));

    const entries = await entriesOf(await exportData(USER));
    const errors = strFromU8(entries['export-errors.txt']!);

    // The text still arrived whole, and so did the file that did work.
    expect(readJson(entries, 'applications.json')).toHaveLength(2);
    expect(entries['files/bbbb2222.png']).toBeDefined();
    expect(entries['files/aaaa1111.pdf']).toBeUndefined();

    // Named so the user knows which letter to go back for.
    expect(errors).toContain('Contoso letter.pdf');
    expect(errors).toContain('Contoso');
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { action: 'export_data' });
  });

  it('writes no export-errors.txt when nothing was skipped', async () => {
    const entries = await entriesOf(await exportData(USER));

    expect(entries['export-errors.txt']).toBeUndefined();
    expect(reportError).not.toHaveBeenCalled();
  });

  it('still fails when the data itself cannot be read — that is the part worth keeping', async () => {
    listAllNotes.mockRejectedValue(new Error('network'));

    await expect(exportData(USER)).rejects.toThrow('network');
  });

  it('reports progress: the data, then each file, then the packing', async () => {
    getProfile.mockResolvedValue({ id: USER, name: 'Dev A', avatar_path: AVATAR });
    const stages: ExportStage[] = [];

    await exportData(USER, (stage) => stages.push(stage));

    expect(stages).toEqual([
      { stage: 'reading' },
      { stage: 'files', done: 0, total: 2 },
      { stage: 'files', done: 1, total: 2 },
      { stage: 'files', done: 2, total: 2 },
      { stage: 'packing' },
    ]);
  });

  it('counts a skipped file as done, so progress never stalls', async () => {
    downloadCoverLetter.mockRejectedValue(new Error('storage_download_failed'));
    const stages: ExportStage[] = [];

    await exportData(USER, (stage) => stages.push(stage));

    expect(stages.at(-2)).toEqual({ stage: 'files', done: 1, total: 1 });
    expect(stages.at(-1)).toEqual({ stage: 'packing' });
  });
});

describe('exportFilename', () => {
  it('names the file for the local day it was saved, zero-padded', () => {
    expect(exportFilename(new Date(2026, 8, 5))).toBe('job-application-tracker-2026-09-05.zip');
  });
});
