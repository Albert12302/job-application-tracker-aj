import { screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayDateInputValue } from '@/domain/date';
import { applicationRow } from '@/test/factories';
import { renderRoutes } from '@/test/render-routes';
import { AddApplicationScreen } from './AddApplicationScreen';

/**
 * The real form, schema, and conversion to a row — only the two data calls are
 * stubs. So these assert §4.3's rules end to end: the copy, what actually gets
 * written, and that a failed save keeps what was typed (§8.2).
 */
const createApplication = vi.fn();
const listApplications = vi.fn();
const setCoverLetter = vi.fn();
const uploadFile = vi.fn();

vi.mock('@/data/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/storage')>()),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  removeCoverLetterObject: async () => {},
}));

vi.mock('@/data/security-events', () => ({ logSecurityEvent: async () => {} }));

vi.mock('@/data/client', () => ({
  AUTH_STORAGE_KEY: 'aj-hunt-auth',
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock('@/queries/use-session', () => ({
  useSignedInUser: () => ({ id: '11111111-1111-1111-1111-111111111111', email: 'dev-a@example.test' }),
  useIsSignedIn: () => true,
  isSignedInNow: () => true,
}));

vi.mock('@/data/applications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/applications')>()),
  createApplication: (...args: unknown[]) => createApplication(...args),
  listApplications: (...args: unknown[]) => listApplications(...args),
  setCoverLetter: (...args: unknown[]) => setCoverLetter(...args),
}));

const NEW_ID = 'b0000000-0000-0000-0000-000000000009';
const PATH = '11111111-1111-1111-1111-111111111111/0b9c3c5e-0000-4000-8000-000000000001.pdf';
const pdf = (name = 'Northwind letter.pdf') => new File(['%PDF-1.4 letter'], name);

const renderAdd = () => renderRoutes({ '/applications/new': AddApplicationScreen }, '/applications/new');

/** The router renders its first route asynchronously, so every test waits for a field. */
async function fillRequired(user: ReturnType<typeof renderRoutes>['user']) {
  await user.type(await screen.findByLabelText('Company'), 'Northwind Traders');
  await user.type(screen.getByLabelText('Position'), 'Senior Frontend Engineer');
}

beforeEach(() => {
  createApplication.mockReset();
  createApplication.mockResolvedValue(applicationRow({ id: NEW_ID }));
  listApplications.mockResolvedValue([applicationRow({ location: 'Austin, TX' })]);
  uploadFile.mockReset().mockResolvedValue(PATH);
  setCoverLetter
    .mockReset()
    .mockImplementation(async (id: string, next: { path: string; name: string }) =>
      applicationRow({ id, cover_letter_path: next.path, cover_letter_name: next.name }),
    );
});

describe('AddApplicationScreen', () => {
  it('shows the SPEC copy once for the two required fields, and writes nothing', async () => {
    const { user } = renderAdd();
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Company and position are required.');
    expect(screen.getAllByText('Company and position are required.')).toHaveLength(1);
    expect(screen.getByLabelText('Company').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Position').getAttribute('aria-invalid')).toBe('true');
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('writes the date as UTC midnight, the location normalized, and no note', async () => {
    const { user } = renderAdd();
    await screen.findByLabelText('Location');
    await fillRequired(user);
    // A spelling this user already has wins over what was typed (§5.2).
    await user.type(screen.getByLabelText('Location'), 'austin, tx');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
    expect(createApplication).toHaveBeenCalledWith(
      {
        date_applied: `${todayDateInputValue()}T00:00:00.000Z`,
        company: 'Northwind Traders',
        position: 'Senior Frontend Engineer',
        location: 'Austin, TX',
        description: null,
        status: 'Applied',
        referral: false,
      },
      null,
    );
    expect(await screen.findByRole('heading', { name: 'Route /applications' })).toBeTruthy();
  });

  it('sends the first note and the referral flag when they are given', async () => {
    const { user } = renderAdd();
    await fillRequired(user);
    await user.click(screen.getByRole('checkbox', { name: 'Applied through a referral' }));
    await user.type(screen.getByLabelText('First note (optional)'), 'Applied through Sam.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
    expect(createApplication.mock.calls[0]?.[0]).toMatchObject({ referral: true });
    expect(createApplication.mock.calls[0]?.[1]).toBe('Applied through Sam.');
  });

  it('keeps every value when the save fails, and says so with a reference', async () => {
    createApplication.mockRejectedValue(new Error('network'));
    const { user } = renderAdd();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save this application.");
    expect(alert.textContent).toMatch(/Error reference [0-9a-f]{8}/);
    expect(screen.getByLabelText('Company')).toHaveProperty('value', 'Northwind Traders');
    expect(screen.getByLabelText('Position')).toHaveProperty('value', 'Senior Frontend Engineer');
    expect(screen.queryByRole('heading', { name: 'Route /applications' })).toBeNull();
  });

  it('reports a field that is too long under that field', async () => {
    const { user } = renderAdd();
    await fillRequired(user);
    await user.clear(await screen.findByLabelText('Company'));
    await user.type(screen.getByLabelText('Company'), 'x'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Keep this under 120 characters.')).toBeTruthy();
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('leaves at once when nothing has been typed', async () => {
    const { user } = renderAdd();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Route /applications' })).toBeTruthy();
  });

  it('asks before discarding what was typed, and stays put if asked to (§9.1)', async () => {
    const { user } = renderAdd();
    await user.type(await screen.findByLabelText('Company'), 'Contoso');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Discard your changes?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Discard your changes?')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Route /applications' })).toBeNull();
    expect(screen.getByLabelText('Company')).toHaveProperty('value', 'Contoso');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByRole('heading', { name: 'Route /applications' })).toBeTruthy();
  });

  it('saves the application first, then uploads the chosen cover letter and attaches it (§4.3)', async () => {
    let finishUpload: (path: string) => void = () => {};
    uploadFile.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
    const { user } = renderAdd();
    await fillRequired(user);

    await user.upload(screen.getByLabelText('Attach cover letter'), pdf());
    expect(await screen.findByText('Northwind letter.pdf')).toBeTruthy();
    expect(screen.getByText('15 bytes')).toBeTruthy();
    // Nothing leaves the browser until Save.
    expect(uploadFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    // The upload shows on the file's row while it runs (§8.2).
    expect(await screen.findByText('Uploading…')).toBeTruthy();
    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();

    finishUpload(PATH);
    expect(await screen.findByRole('heading', { name: 'Route /applications' })).toBeTruthy();
    expect(setCoverLetter).toHaveBeenCalledWith(NEW_ID, { path: PATH, name: 'Northwind letter.pdf' }, null);
  });

  it('refuses a file by its bytes as soon as it is chosen, and saves without it', async () => {
    const { user } = renderAdd();
    await fillRequired(user);

    const disguised = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'letter.pdf');
    await user.upload(screen.getByLabelText('Attach cover letter'), disguised);
    expect((await screen.findByRole('alert')).textContent).toBe('Choose a PDF, DOC, or DOCX file.');
    expect(screen.queryByText('letter.pdf')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Route /applications' })).toBeTruthy();
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('keeps the application when the upload fails, and goes to its detail screen for the retry (§8.2)', async () => {
    uploadFile.mockRejectedValue(new Error('network'));
    const { user, router } = renderAdd();
    await fillRequired(user);
    await user.upload(screen.getByLabelText('Attach cover letter'), pdf());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Route /applications/$id' })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/applications/${NEW_ID}`);
    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(setCoverLetter).not.toHaveBeenCalled();
  });

  it('lets a chosen file be cleared, keeping focus on the picker', async () => {
    const { user } = renderAdd();
    await user.upload(await screen.findByLabelText('Attach cover letter'), pdf());
    await user.click(await screen.findByRole('button', { name: 'Remove file' }));

    expect(screen.queryByText('Northwind letter.pdf')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('Attach cover letter'));
  });

  it('asks before Cancel discards a chosen file', async () => {
    const { user } = renderAdd();
    await user.upload(await screen.findByLabelText('Attach cover letter'), pdf());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Discard your changes?')).toBeTruthy();
  });

  it('has no axe violations with a cover letter chosen', async () => {
    const { user, container } = renderAdd();
    await user.upload(await screen.findByLabelText('Attach cover letter'), pdf());
    await screen.findByText('Northwind letter.pdf');
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('has no axe violations, including with the required message showing', async () => {
    const { user, container } = renderAdd();
    await screen.findByLabelText('Location');
    expect((await axe.run(container)).violations).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
