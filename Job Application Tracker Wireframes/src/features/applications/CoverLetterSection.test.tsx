import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@/domain/schemas';
import { applicationRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { ApplicationDetailScreen } from './ApplicationDetailScreen';

/**
 * The cover letter on the detail screen (SPEC §4.4, §9.4), through the real
 * screen, hooks, and services — only the calls that leave the browser are
 * stubs. The ordering rules themselves are pinned in
 * services/attach-cover-letter.test.ts; these assert what the user sees.
 */

const getApplication = vi.fn();
const setCoverLetter = vi.fn();
const uploadFile = vi.fn();
const coverLetterSize = vi.fn();
const coverLetterDownloadUrl = vi.fn();
const removeCoverLetterObject = vi.fn();
const startDownload = vi.fn();

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => ({ id: '11111111-1111-1111-1111-111111111111', email: 'dev-a@example.test' }),
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));

vi.mock('@/data/notes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/notes')>()),
  listNotes: async () => [],
}));

vi.mock('@/data/security-events', () => ({ logSecurityEvent: async () => {} }));

vi.mock('@/data/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/applications')>()),
  getApplication: (...args: unknown[]) => getApplication(...args),
  setCoverLetter: (...args: unknown[]) => setCoverLetter(...args),
}));

vi.mock('@/data/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/storage')>()),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  coverLetterSize: (...args: unknown[]) => coverLetterSize(...args),
  coverLetterDownloadUrl: (...args: unknown[]) => coverLetterDownloadUrl(...args),
  removeCoverLetterObject: (...args: unknown[]) => removeCoverLetterObject(...args),
}));

vi.mock('./start-download', () => ({ startDownload: (...args: unknown[]) => startDownload(...args) }));

const ID = 'a0000000-0000-0000-0000-000000000001';
const USER = '11111111-1111-1111-1111-111111111111';
const OLD = `${USER}/0b9c3c5e-0000-4000-8000-000000000001.pdf`;
const NEW = `${USER}/0b9c3c5e-0000-4000-8000-000000000002.docx`;
const SIGNED = 'http://127.0.0.1:54321/storage/v1/object/sign/cover-letters/x?token=secret-token&download=a.pdf';

const pdf = (name = 'Northwind letter.pdf') => new File(['%PDF-1.4 letter'], name);

let row: Application;

const renderDetail = () => renderRoutes({ '/applications/$id': ApplicationDetailScreen }, `/applications/${ID}`);

beforeEach(() => {
  row = applicationRow({ id: ID, company: 'Northwind Traders' });
  getApplication.mockReset().mockImplementation(async () => row);
  setCoverLetter.mockReset().mockImplementation(async (_id, next: { path: string; name: string } | null) => {
    row = { ...row, cover_letter_path: next?.path ?? null, cover_letter_name: next?.name ?? null };
    return row;
  });
  uploadFile.mockReset().mockResolvedValue(NEW);
  coverLetterSize.mockReset().mockResolvedValue(1_468_006);
  coverLetterDownloadUrl.mockReset().mockResolvedValue(SIGNED);
  removeCoverLetterObject.mockReset().mockResolvedValue(undefined);
  startDownload.mockReset();
});

const withFile = (name = 'Northwind letter.pdf') => {
  row = { ...row, cover_letter_path: OLD, cover_letter_name: name };
};

describe('CoverLetterSection', () => {
  it('says when there is none, and offers to attach one', async () => {
    renderDetail();

    expect(await screen.findByText('No cover letter attached.')).toBeTruthy();
    const attach = screen.getByLabelText('Attach cover letter');
    expect(attach.getAttribute('type')).toBe('file');
    expect(attach.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('PDF, DOC, or DOCX, up to 10 MB.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(coverLetterSize).not.toHaveBeenCalled();
  });

  it('shows the name as text and the size once it loads', async () => {
    let resolveSize: (size: number) => void = () => {};
    coverLetterSize.mockReturnValue(new Promise((resolve) => (resolveSize = resolve)));
    withFile('<img src=x onerror=alert(1)>.pdf');
    const { container } = renderDetail();

    // Escaped: the markup is characters on the screen, not an element in it (§7.3).
    expect(await screen.findByText('<img src=x onerror=alert(1)>.pdf')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Loading the file size')).toBeTruthy();

    resolveSize(1_468_006);
    expect(await screen.findByText('1.4 MB')).toBeTruthy();
    expect(coverLetterSize).toHaveBeenCalledWith(OLD);
  });

  it('says when the size cannot load, and Retry fetches it again', async () => {
    coverLetterSize.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(2048);
    withFile();
    const { user } = renderDetail();

    expect(await screen.findByText("Couldn't load the file size.")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('2 KB')).toBeTruthy();
  });

  it('attaches a file: shows the upload on the row, then the file', async () => {
    let finishUpload: (path: string) => void = () => {};
    uploadFile.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
    const { user } = renderDetail();

    await user.upload(await screen.findByLabelText('Attach cover letter'), pdf());
    expect(await screen.findByText('Uploading Northwind letter.pdf…')).toBeTruthy();
    expect(screen.getByLabelText('Attach cover letter')).toHaveProperty('disabled', true);

    finishUpload(NEW);
    expect(await screen.findByText('Northwind letter.pdf')).toBeTruthy();
    // The size of the file just sent, without asking Storage for it.
    expect(await screen.findByText('15 bytes')).toBeTruthy();
    expect(coverLetterSize).not.toHaveBeenCalled();
    expect(setCoverLetter).toHaveBeenCalledWith(ID, { path: NEW, name: 'Northwind letter.pdf' }, null);
    expect(screen.getByLabelText('Replace cover letter')).toBeTruthy();
  });

  it('refuses a file by its bytes, uploading nothing', async () => {
    const { user } = renderDetail();
    const disguised = new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'letter.pdf');

    await user.upload(await screen.findByLabelText('Attach cover letter'), disguised);
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a PDF, DOC, or DOCX file.');
    expect(uploadFile).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('says "Upload failed." with a reference, and Retry sends the same file again (§8.2)', async () => {
    uploadFile.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(NEW);
    const { user } = renderDetail();
    const file = pdf();

    await user.upload(await screen.findByLabelText('Attach cover letter'), file);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Upload failed.');
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(screen.getByText('No cover letter attached.')).toBeTruthy();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Northwind letter.pdf')).toBeTruthy();
    expect(uploadFile).toHaveBeenLastCalledWith('cover-letter', file);
    expect(screen.queryByText('Upload failed.')).toBeNull();
  });

  it('replaces a file: the old one is deleted after the new one is saved', async () => {
    withFile('Old letter.pdf');
    const { user } = renderDetail();

    await user.upload(await screen.findByLabelText('Replace cover letter'), pdf('New letter.docx'));
    expect(await screen.findByText('New letter.docx')).toBeTruthy();
    expect(setCoverLetter).toHaveBeenCalledWith(ID, { path: NEW, name: 'New letter.docx' }, OLD);
    await waitFor(() => expect(removeCoverLetterObject).toHaveBeenCalledWith(OLD));
    expect(setCoverLetter.mock.invocationCallOrder[0]!).toBeLessThan(removeCoverLetterObject.mock.invocationCallOrder[0]!);
  });

  it('keeps the current file when a replace fails', async () => {
    withFile('Old letter.pdf');
    uploadFile.mockRejectedValue(new Error('network'));
    const { user } = renderDetail();

    await user.upload(await screen.findByLabelText('Replace cover letter'), pdf('New letter.pdf'));
    expect(await screen.findByText('Upload failed.')).toBeTruthy();
    expect(screen.getByText('Old letter.pdf')).toBeTruthy();
    expect(removeCoverLetterObject).not.toHaveBeenCalled();
  });

  it('makes a signed URL only when Download is clicked, and never puts it in the page', async () => {
    withFile();
    const { user, container } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Download cover letter' }));
    await waitFor(() => expect(startDownload).toHaveBeenCalledWith(SIGNED));
    expect(coverLetterDownloadUrl).toHaveBeenCalledTimes(1);
    expect(coverLetterDownloadUrl).toHaveBeenCalledWith(OLD, 'Northwind letter.pdf');
    expect(container.innerHTML).not.toContain('secret-token');
    expect(document.body.innerHTML).not.toContain('/object/sign/');
  });

  it('says when a download cannot start, and Retry asks for a new URL', async () => {
    withFile();
    coverLetterDownloadUrl.mockRejectedValueOnce(new Error('network'));
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Download cover letter' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't download the cover letter.");
    expect(startDownload).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(startDownload).toHaveBeenCalledWith(SIGNED));
    expect(coverLetterDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it('asks before removing, names the file, and does nothing when kept (§9.4)', async () => {
    withFile();
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Remove cover letter' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Remove the cover letter?')).toBeTruthy();
    expect(dialog.textContent).toContain('This deletes Northwind letter.pdf from this application.');

    await user.click(within(dialog).getByRole('button', { name: 'Keep cover letter' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(setCoverLetter).not.toHaveBeenCalled();
    expect(removeCoverLetterObject).not.toHaveBeenCalled();
    expect(screen.getByText('Northwind letter.pdf')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove cover letter' })));
  });

  it('removes once confirmed: the field clears, then the object goes, and focus lands on Attach', async () => {
    withFile();
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Remove cover letter' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove cover letter' }));

    expect(await screen.findByText('No cover letter attached.')).toBeTruthy();
    expect(setCoverLetter).toHaveBeenCalledWith(ID, null, OLD);
    await waitFor(() => expect(removeCoverLetterObject).toHaveBeenCalledWith(OLD));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Attach cover letter')));
  });

  it('keeps the file and says so when a removal fails; confirming again retries', async () => {
    withFile();
    setCoverLetter.mockRejectedValueOnce(new Error('network'));
    const { user } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Remove cover letter' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove cover letter' }));

    expect((await within(dialog).findByRole('alert')).textContent).toContain("Couldn't remove the cover letter.");
    expect(removeCoverLetterObject).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Remove cover letter' }));
    expect(await screen.findByText('No cover letter attached.')).toBeTruthy();
  });

  it('has no axe violations with a file attached', async () => {
    withFile();
    const { container } = renderDetail();
    await screen.findByText('1.4 MB');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
