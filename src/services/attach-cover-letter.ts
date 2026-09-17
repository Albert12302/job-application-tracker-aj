import { setCoverLetter } from '@/data/applications';
import { removeCoverLetterObject, type UploadRefusal, UploadRefusedError, uploadFile } from '@/data/storage';
import {
  COVER_LETTER_ERRORS,
  COVER_LETTER_SNIFF_BYTES,
  coverLetterLabel,
  coverLetterProblem,
  sniffCoverLetterType,
} from '@/domain/cover-letter';
import type { Application } from '@/domain/schemas';
import { discardObject } from './discard-object';
import { reportError } from './report-error';

/** The file was refused for a reason the user can fix. Not a bug; not reported. */
export class CoverLetterRejectedError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super('cover_letter_rejected');
    this.name = 'CoverLetterRejectedError';
    this.userMessage = userMessage;
  }
}

/** The upload function's refusals, in the same words as the checks below. It never sends `dimensions` for a document. */
const REFUSAL_COPY: Record<UploadRefusal, string> = {
  type: COVER_LETTER_ERRORS.type,
  size: COVER_LETTER_ERRORS.size,
  dimensions: COVER_LETTER_ERRORS.type,
  rate_limited: COVER_LETTER_ERRORS.rateLimited,
};

/**
 * What is wrong with `file` as a cover letter, or null — by its bytes, never its
 * name (§7.3). The browser's copy of the upload function's check: a refusal
 * without a round trip, and without spending one of the hour's 20 uploads.
 */
export async function coverLetterFileProblem(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, COVER_LETTER_SNIFF_BYTES).arrayBuffer());
  return coverLetterProblem({ type: sniffCoverLetterType(head), size: file.size });
}

/**
 * Attach a cover letter to an application, or replace the one it has (SPEC
 * §4.3, §4.4, §9.4). One path for both, so replace cannot drift from attach.
 *
 * 1. The file is checked here, then stored by the upload function — the only
 *    writer to Storage, which checks the bytes again and names the object with
 *    a UUID. The original name is kept only as the row's display label.
 * 2. The row is pointed at the new object, provided it still holds `currentPath`
 *    (data/applications.ts `setCoverLetter`). If that fails the new object is
 *    removed, because nothing points at it.
 * 3. Only then is the old object deleted (§9.4). A failure there leaves an
 *    orphan, reported for cleanup — the replace itself has already happened.
 */
export async function attachCoverLetter(
  applicationId: string,
  file: File,
  currentPath: string | null,
): Promise<Application> {
  const problem = await coverLetterFileProblem(file);
  if (problem) throw new CoverLetterRejectedError(problem);

  let path: string;
  try {
    path = await uploadFile('cover-letter', file);
  } catch (error) {
    if (error instanceof UploadRefusedError) throw new CoverLetterRejectedError(REFUSAL_COPY[error.reason]);
    throw error;
  }

  let saved: Application;
  try {
    saved = await setCoverLetter(applicationId, { path, name: coverLetterLabel(file.name) }, currentPath);
  } catch (error) {
    await removeCoverLetterObject(path).catch((cleanup: unknown) =>
      reportError(cleanup, { action: 'attach_cover_letter' }),
    );
    throw error;
  }

  if (currentPath) await discardObject('cover-letter', currentPath);

  return saved;
}
