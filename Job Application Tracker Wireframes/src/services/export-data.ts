import { strToU8, zipSync, type Zippable } from 'fflate';
import { listApplications } from '@/data/applications';
import { listAllNotes } from '@/data/notes';
import { getProfile } from '@/data/profile';
import { listSavedFilters } from '@/data/saved-filters';
import { listStatusHistory } from '@/data/status-history';
import { downloadAvatar, downloadCoverLetter } from '@/data/storage';
import type { Application, Note, StatusChange } from '@/domain/schemas';
import { errorCode, reportError } from './report-error';

/**
 * Export everything the user has (SPEC §9.8) — the one path, built entirely in
 * the browser from data they can already read. No server job, no export table,
 * no email-me-a-link: at the 5,000-application cap this is a few megabytes of
 * text, and a queue would be infrastructure earning nothing.
 *
 * Deleting without an exit is a hostage situation, so this ships before
 * account deletion (§9.7) and the deletion dialog offers it.
 *
 * A file that will not come is not a failed export. It is named in
 * `export-errors.txt` and everything else is still handed over (§9.8) — the
 * point of the zip is the text, and a Storage hiccup must not cost the user
 * their notes.
 */

/** What the button is showing (§8.2). `total` is files, the only countable part. */
export type ExportStage =
  | { stage: 'reading' }
  | { stage: 'files'; done: number; total: number }
  | { stage: 'packing' };

export type ExportProgress = (stage: ExportStage) => void;

/** One file to put in `files/`, and what to say if it does not arrive. */
type PendingFile = { name: string; label: string; fetch: () => Promise<Blob> };

/** JSON deflates well. Stored files do not — see FILE_OPTIONS. */
const TEXT_OPTIONS = { level: 6 } as const;

/**
 * Stored, not deflated: every type the app accepts (PDF, DOCX, PNG, JPEG,
 * WebP) is already compressed, so deflating them spends time to save nothing.
 * DOC is the one exception and is not worth a second code path.
 */
const FILE_OPTIONS = { level: 0 } as const;

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

/** `{user_id}/{uuid}.pdf` → `{uuid}.pdf`. The name inside `files/`. */
function storedName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function groupBy<T, K extends string>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const id = key(row);
    const existing = grouped.get(id);
    if (existing) existing.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

/**
 * Each application with its notes and its full status history nested (§9.8).
 * JSON, not CSV: flattening these two out loses the part worth keeping.
 */
function nest(applications: readonly Application[], notes: readonly Note[], history: readonly StatusChange[]) {
  const notesByApplication = groupBy(notes, (note) => note.application_id);
  const historyByApplication = groupBy(history, (change) => change.application_id);

  return applications.map((application) => ({
    ...application,
    notes: notesByApplication.get(application.id) ?? [],
    status_history: historyByApplication.get(application.id) ?? [],
  }));
}

/** The cover letters and the avatar, in the order they will be fetched. */
function filesToFetch(applications: readonly Application[], avatarPath: string | null): PendingFile[] {
  const files: PendingFile[] = [];

  for (const application of applications) {
    if (!application.cover_letter_path) continue;
    const path = application.cover_letter_path;
    files.push({
      name: storedName(path),
      label: `${application.cover_letter_name ?? storedName(path)} (${application.company} — ${application.position})`,
      fetch: () => downloadCoverLetter(path),
    });
  }

  if (avatarPath) {
    files.push({ name: storedName(avatarPath), label: 'Profile photo', fetch: () => downloadAvatar(avatarPath) });
  }

  return files;
}

/**
 * Names what did not make it, in the user's own words rather than a log's
 * (§9.8). This file is theirs, not `app_errors` — it says which letter is
 * missing so they know to go back for it, and carries an error code only so a
 * repeated failure can be described.
 *
 * Written only when something was skipped: an empty errors file in every
 * export teaches people to ignore it.
 */
function errorsFile(skipped: readonly { label: string; code: string }[]): Uint8Array {
  const lines = [
    'Some files could not be downloaded and are missing from this export.',
    'Everything else here is complete. Try exporting again for the files below.',
    '',
    ...skipped.map((file) => `- ${file.label} [${file.code}]`),
    '',
  ];
  return strToU8(lines.join('\n'));
}

/**
 * The whole export as a zip, ready to save.
 *
 * Reads first and fetches files second, so the text — the part that cannot be
 * re-fetched once an account is gone — is already in hand before anything
 * slow or flaky starts.
 */
export async function exportData(userId: string, onProgress: ExportProgress = () => {}): Promise<Blob> {
  onProgress({ stage: 'reading' });

  const [applications, notes, history, savedFilters, profile] = await Promise.all([
    listApplications(userId),
    listAllNotes(),
    listStatusHistory(),
    listSavedFilters(userId),
    getProfile(userId),
  ]);

  const pending = filesToFetch(applications, profile?.avatar_path ?? null);
  const stored: Zippable = {};
  const skipped: { label: string; code: string }[] = [];

  onProgress({ stage: 'files', done: 0, total: pending.length });

  // One at a time: each cover letter costs a signed URL and up to 10 MB, and a
  // burst of parallel fetches buys little on an export nobody is waiting on.
  for (const [index, file] of pending.entries()) {
    try {
      const buffer: ArrayBuffer = await (await file.fetch()).arrayBuffer();
      stored[file.name] = [new Uint8Array(buffer), FILE_OPTIONS];
    } catch (error) {
      skipped.push({ label: file.label, code: errorCode(error) });
      // Reported so a systematic failure is visible, and deduplicated by
      // action and code inside reportError — twenty failed letters write one row.
      reportError(error, { action: 'export_data' });
    }
    onProgress({ stage: 'files', done: index + 1, total: pending.length });
  }

  onProgress({ stage: 'packing' });

  const contents: Zippable = {
    'applications.json': [json(nest(applications, notes, history)), TEXT_OPTIONS],
    'saved-filters.json': [json(savedFilters), TEXT_OPTIONS],
    'profile.json': [json(profile), TEXT_OPTIONS],
  };
  if (Object.keys(stored).length > 0) contents.files = stored;
  if (skipped.length > 0) contents['export-errors.txt'] = [errorsFile(skipped), TEXT_OPTIONS];

  // zipSync, never fflate's async API: that one builds its worker from a blob:
  // URL, and the §7.5 policy has no worker-src, so it falls back to
  // default-src 'self' and the worker is refused. Synchronous also means the
  // whole zip is in memory at once — fine for a few megabytes of text, and the
  // day someone holds hundreds of megabytes of letters this becomes fflate's
  // streaming Zip instead.
  return new Blob([zipSync(contents)], { type: 'application/zip' });
}

/** Local date: this names a file the user is saving now, not an applied-on date (§5.4). */
export function exportFilename(now: Date = new Date()): string {
  const parts = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  return `job-application-tracker-${parts.map((part) => String(part).padStart(2, '0')).join('-')}.zip`;
}
