import type { ApplicationInput } from '@/domain/application-input';
import {
  applicationSchema,
  statsApplicationSchema,
  coverLetterSchema,
  type Application,
  type StatsApplication,
  type CoverLetter,
} from '@/domain/schemas';
import type { Status } from '@/domain/status';
import { allPages } from './all-pages';
import { supabase } from './client';

/**
 * Applications (SPEC §2). RLS scopes every call to the signed-in user (§7.2):
 * nothing here sends a user_id, and the user_id filters only keep a query
 * honest if a policy ever regresses.
 */

/** Gone, or not this user's — RLS makes the two look the same, and so does the app (§8.2). */
export class ApplicationNotFoundError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('application_not_found', options);
    this.name = 'ApplicationNotFoundError';
  }
}

/**
 * Newest first (§5.3): date applied, then most recently added — as domain/order.ts sorts —
 * then id, so the order is total and no row moves between pages while they are read.
 *
 * Every row, however many: the tabs count the whole set and filtering happens over it (§5.3),
 * so a list cut off at max_rows would miscount and silently leave applications out.
 */
export async function listApplications(userId: string): Promise<Application[]> {
  const rows = await allPages((from, to) =>
    supabase
      .from('applications')
      .select('*')
      .eq('user_id', userId)
      .order('date_applied', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  );
  return applicationSchema.array().parse(rows);
}

/** Null when missing or someone else's (§8.2: never reveal which). */
export async function getApplication(id: string): Promise<Application | null> {
  const { data, error } = await supabase.from('applications').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? applicationSchema.parse(data) : null;
}

/**
 * Every one of the user's applications, as stats need them — id, status, and referral, the
 * whole set however large (§5.3), never a page of the list.
 */
export async function listStatsApplications(userId: string): Promise<StatsApplication[]> {
  const rows = await allPages((from, to) =>
    supabase
      .from('applications')
      .select('id, status, referral')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, to),
  );
  return statsApplicationSchema.array().parse(rows);
}

export async function countApplications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}

/** How many applications hold a cover letter — the files half of §9.7's count. */
export async function countCoverLetters(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('cover_letter_path', 'is', null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Add (§4.3): the application, its creation status_history row, and the first
 * note, in one transaction (create_application). An absent optional is left
 * out rather than sent: the function's own default is what stores the null.
 */
export async function createApplication(input: ApplicationInput, firstNote: string | null): Promise<Application> {
  const { data, error } = await supabase.rpc('create_application', {
    p_date_applied: input.date_applied,
    p_company: input.company,
    p_position: input.position,
    p_status: input.status,
    p_referral: input.referral,
    ...(input.location === null ? {} : { p_location: input.location }),
    ...(input.description === null ? {} : { p_description: input.description }),
    ...(firstNote === null ? {} : { p_first_note: firstNote }),
  });
  if (error) throw error;
  return applicationSchema.parse(data);
}

/**
 * Every edited field except the status, which changes only through
 * services/change-status.ts (§9.1) — a status written here would have no
 * history row.
 */
export async function updateApplicationFields(
  id: string,
  fields: Omit<ApplicationInput, 'status'>,
): Promise<Application> {
  const { data, error } = await supabase.from('applications').update(fields).eq('id', id).select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new ApplicationNotFoundError();
  return applicationSchema.parse(data);
}

export async function setStarred(id: string, starred: boolean): Promise<void> {
  const { data, error } = await supabase.from('applications').update({ starred }).eq('id', id).select('id');
  if (error) throw error;
  // RLS answers an update it refuses with zero rows, not an error.
  if (!data.length) throw new ApplicationNotFoundError();
}

/**
 * Status + status_history row in one transaction (change_application_status).
 * Called only by services/change-status.ts, the one status-change path (§9.1).
 */
export async function changeApplicationStatus(id: string, status: Status): Promise<Application> {
  const { data, error } = await supabase.rpc('change_application_status', { p_application_id: id, p_status: status });
  if (error) {
    // P0002 is the function's own "no such application"; the message is its code, not user data.
    if (error.code === 'P0002') throw new ApplicationNotFoundError({ cause: error });
    throw error;
  }
  return applicationSchema.parse(data);
}

/**
 * The row is gone, or its cover letter is no longer the one this change started
 * from — another tab replaced or removed it first.
 */
export class CoverLetterChangedError extends Error {
  constructor() {
    super('cover_letter_changed');
    this.name = 'CoverLetterChangedError';
  }
}

/**
 * Point the application at a new cover letter, or at none (§9.4).
 *
 * Only if it still holds `current`: the caller deletes `current`'s object once
 * this commits, so the write has to be the one that actually let go of it. Had
 * another tab swapped the file in the meantime, an unguarded write would leave
 * that tab's file orphaned and this one would delete a file nothing replaced.
 */
export async function setCoverLetter(
  id: string,
  next: CoverLetter | null,
  current: string | null,
): Promise<Application> {
  const file = next ? coverLetterSchema.parse(next) : null;
  const update = supabase
    .from('applications')
    .update({ cover_letter_path: file?.path ?? null, cover_letter_name: file?.name ?? null })
    .eq('id', id);
  const guarded = current === null ? update.is('cover_letter_path', null) : update.eq('cover_letter_path', current);
  const { data, error } = await guarded.select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new CoverLetterChangedError();
  return applicationSchema.parse(data);
}

/**
 * The per-user write limit refused the change (§7.1). The user's to wait out, so
 * not reported. The trigger raises a bare code, never the row's content.
 */
export class WriteRateLimitedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('write_rate_limited', options);
    this.name = 'WriteRateLimitedError';
  }
}

/** The write-limit trigger's bare code, on any of the four writable tables (§7.1). */
export const isWriteRateLimited = (error: { message: string }) => error.message === 'rate_limited';

/**
 * Deletes the row; its notes and status_history rows go with it (on delete
 * cascade, §9.2). Returns the cover letter path it held, because Storage does
 * not cascade and the caller has to remove the file. Every cascaded note counts
 * against the write limit too, so a large delete can be refused part-way.
 */
export async function deleteApplicationRow(id: string): Promise<{ coverLetterPath: string | null }> {
  const { data, error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .select('cover_letter_path')
    .maybeSingle();
  if (error) throw isWriteRateLimited(error) ? new WriteRateLimitedError({ cause: error }) : error;
  if (!data) throw new ApplicationNotFoundError();
  return { coverLetterPath: data.cover_letter_path };
}
