import { noteSchema, type Note } from '@/domain/schemas';
import { supabase } from './client';

/**
 * Notes (SPEC §2, §9.3). Ownership comes from the parent application: the RLS
 * policies are EXISTS checks against it, so no user_id is stored or sent.
 * Display order is creation order; editing bumps updated_at and never reorders.
 */

/** The 200-per-application cap (§7.3) — the user's to resolve, so not reported. */
export class NoteLimitError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('note_limit_reached', options);
    this.name = 'NoteLimitError';
  }
}

/** The note is gone — deleted in another tab, or its application was. */
export class NoteNotFoundError extends Error {
  constructor() {
    super('note_not_found');
    this.name = 'NoteNotFoundError';
  }
}

// The trigger raises a bare code (supabase/migrations/…_notes.sql), never the note's text.
const isNoteLimit = (error: { message: string }) => error.message === 'note_limit_reached';

export async function listNotes(applicationId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return noteSchema.array().parse(data);
}

export async function addNote(applicationId: string, body: string): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .insert({ application_id: applicationId, body })
    .select('*')
    .single();
  if (error) throw isNoteLimit(error) ? new NoteLimitError({ cause: error }) : error;
  return noteSchema.parse(data);
}

export async function updateNote(id: string, body: string): Promise<Note> {
  const { data, error } = await supabase.from('notes').update({ body }).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new NoteNotFoundError();
  return noteSchema.parse(data);
}

/** Already gone counts as done: the user wanted it deleted, and it is. */
export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Undo for a deleted note (§9.3): the same text at its original created_at,
 * so it returns to the same place in the list. It gets a new id.
 */
export async function restoreNote(note: Pick<Note, 'application_id' | 'body' | 'created_at'>): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .insert({ application_id: note.application_id, body: note.body, created_at: note.created_at })
    .select('*')
    .single();
  if (error) throw isNoteLimit(error) ? new NoteLimitError({ cause: error }) : error;
  return noteSchema.parse(data);
}
