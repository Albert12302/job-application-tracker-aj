import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteRateLimitedError } from '@/data/write-limit';
import { noteRow } from '@/test/factories';
import { NotesSection } from './NotesSection';

const listNotes = vi.fn();
const addNote = vi.fn();
const updateNote = vi.fn();
const deleteNote = vi.fn();
// What a report would actually write (services/report-error.ts → data/app-errors.ts).
const insertAppError = vi.fn();

vi.mock('@/data/app-errors', () => ({ insertAppError: (...args: unknown[]) => insertAppError(...args) }));

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
  listNotes: (...args: unknown[]) => listNotes(...args),
  addNote: (...args: unknown[]) => addNote(...args),
  updateNote: (...args: unknown[]) => updateNote(...args),
  deleteNote: (...args: unknown[]) => deleteNote(...args),
}));

const APPLICATION = 'a0000000-0000-0000-0000-000000000001';
const SHORT = 'Recruiter screen went well.';
const LONG = 'x'.repeat(120);

function renderNotes() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <NotesSection applicationId={APPLICATION} />
    </QueryClientProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

beforeEach(() => {
  listNotes.mockReset();
  addNote.mockReset();
  updateNote.mockReset();
  deleteNote.mockReset();
  listNotes.mockResolvedValue([]);
  insertAppError.mockReset().mockResolvedValue(undefined);
});

describe('NotesSection', () => {
  it('says when there are none yet', async () => {
    const { container } = renderNotes();
    expect(await screen.findByText('No notes yet.')).toBeTruthy();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('lists notes oldest first, and a new one lands at the end (§2)', async () => {
    const older = noteRow({ body: 'First, at the start.', created_at: '2026-09-01T10:00:00+00:00' });
    const newer = noteRow({ body: 'Second, later.', created_at: '2026-09-02T10:00:00+00:00' });
    // Whatever order the answer arrives in, creation order is what shows.
    listNotes.mockResolvedValue([newer, older]);
    const added = noteRow({ body: 'Third, newest.', created_at: '2026-09-03T10:00:00+00:00' });
    addNote.mockResolvedValue(added);
    const { user } = renderNotes();

    await screen.findByText('First, at the start.');
    const order = () => screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(order()[0]).toContain('First, at the start.');

    listNotes.mockResolvedValue([older, newer, added]);
    await user.type(screen.getByLabelText('Add a note'), 'Third, newest.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(order().map((text) => text?.slice(0, 6))).toEqual(['First,', 'Second', 'Third,']);
  });

  it('lists the notes it has', async () => {
    listNotes.mockResolvedValue([noteRow({ body: SHORT, application_id: APPLICATION })]);
    const { container } = renderNotes();
    expect(await screen.findByText(SHORT)).toBeTruthy();
    expect(screen.queryByText('No notes yet.')).toBeNull();
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it('shows a new note at once, muted, then as a note', async () => {
    const saved = noteRow({ body: 'Take-home sent.', application_id: APPLICATION });
    let confirm: (note: unknown) => void = () => {};
    addNote.mockReturnValue(new Promise((resolve) => (confirm = resolve)));
    const { user } = renderNotes();

    await user.type(await screen.findByLabelText('Add a note'), 'Take-home sent.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    // The field is cleared and the note is already on screen while it saves (§8.3).
    expect(screen.getByLabelText('Add a note')).toHaveProperty('value', '');
    const saving = await screen.findByText('Take-home sent.');
    expect(saving.textContent).toContain('(saving)');
    expect(addNote).toHaveBeenCalledWith(APPLICATION, 'Take-home sent.');

    // What the list holds once it is saved, for the refetch that follows.
    listNotes.mockResolvedValue([saved]);
    confirm(saved);
    await waitFor(() => expect(screen.getByText('Take-home sent.').textContent).not.toContain('(saving)'));
  });

  it('adds with Enter, and keeps Shift + Enter for a new line', async () => {
    addNote.mockResolvedValue(noteRow({ body: 'Quick note', application_id: APPLICATION }));
    const { user } = renderNotes();
    const field = await screen.findByLabelText('Add a note');

    await user.type(field, 'First line{Shift>}{Enter}{/Shift}second line');
    expect(addNote).not.toHaveBeenCalled();

    await user.type(field, '{Enter}');
    await waitFor(() => expect(addNote).toHaveBeenCalledWith(APPLICATION, 'First line\nsecond line'));
  });

  it('gives the text back and offers Retry when a note will not save (§8.2)', async () => {
    addNote.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(noteRow({ body: 'Panel booked.' }));
    const { user } = renderNotes();

    await user.type(await screen.findByLabelText('Add a note'), 'Panel booked.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect(await screen.findByText("Couldn't save note.")).toBeTruthy();
    expect(screen.getByLabelText('Add a note')).toHaveProperty('value', 'Panel booked.');

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(2));
  });

  /**
   * The §7.1 write limit is the user's to wait out, not a bug: the text stays in
   * the box, the message says to wait, nothing reaches app_errors, and no error
   * reference is offered — there is nothing to quote.
   */
  it('asks the user to wait out the write limit, and reports nothing (§7.1)', async () => {
    addNote.mockRejectedValueOnce(new WriteRateLimitedError()).mockResolvedValueOnce(noteRow({ body: 'Panel booked.' }));
    const { user } = renderNotes();

    await user.type(await screen.findByLabelText('Add a note'), 'Panel booked.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't save note.");
    expect(alert.textContent).toContain("You've made a lot of changes in the last minute.");
    expect(alert.textContent).not.toMatch(/Error reference/);
    expect(insertAppError).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Add a note')).toHaveProperty('value', 'Panel booked.');

    // A minute later, the same Retry saves it.
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(2));
  });

  it('explains the 200-note cap instead of offering Retry', async () => {
    const { NoteLimitError } = await import('@/data/notes');
    addNote.mockRejectedValue(new NoteLimitError());
    const { user } = renderNotes();

    await user.type(await screen.findByLabelText('Add a note'), 'One too many');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    expect(await screen.findByText(/200 notes/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('refuses an empty note without asking the database', async () => {
    const { user } = renderNotes();
    await user.click(await screen.findByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Write something first.')).toBeTruthy();
    expect(addNote).not.toHaveBeenCalled();
  });

  it('edits a note in place, and Escape leaves it alone (§9.3)', async () => {
    const note = noteRow({ body: SHORT, application_id: APPLICATION });
    listNotes.mockResolvedValue([note]);
    updateNote.mockResolvedValue({ ...note, body: 'Recruiter screen went well. Panel next.' });
    const { user } = renderNotes();

    await user.click(await screen.findByRole('button', { name: /^Edit note from/ }));
    const editor = screen.getByRole('textbox', { name: /^Edit note from/ });
    await user.clear(editor);
    await user.type(editor, 'Changed my mind');
    await user.keyboard('{Escape}');
    expect(updateNote).not.toHaveBeenCalled();
    expect(await screen.findByText(SHORT)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Edit note from/ }));
    await user.clear(screen.getByRole('textbox', { name: /^Edit note from/ }));
    await user.type(screen.getByRole('textbox', { name: /^Edit note from/ }), 'Panel next.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateNote).toHaveBeenCalledWith(note.id, 'Panel next.'));
  });

  it('deletes a one-line note at once, and asks first for a longer one (§9.3)', async () => {
    const short = noteRow({ body: SHORT, application_id: APPLICATION });
    const long = noteRow({ body: LONG, application_id: APPLICATION });
    listNotes.mockResolvedValue([short, long]);
    deleteNote.mockResolvedValue(undefined);
    const { user } = renderNotes();

    const items = await screen.findAllByRole('listitem');
    listNotes.mockResolvedValue([long]); // what the refetch after the delete finds
    await user.click(within(items[0]!).getByRole('button', { name: /^Delete note from/ }));
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith(short.id));
    await waitFor(() => expect(screen.queryByText(SHORT)).toBeNull());

    await user.click(screen.getByRole('button', { name: /^Delete note from/ }));
    expect(await screen.findByText('Delete this note?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep note' }));
    await waitFor(() => expect(screen.queryByText('Delete this note?')).toBeNull());
    expect(deleteNote).toHaveBeenCalledTimes(1);

    listNotes.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: /^Delete note from/ }));
    await user.click(await screen.findByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith(long.id));
  });
});
