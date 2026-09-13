/**
 * Cover letter rules (SPEC §4.3, §4.4, §7.3). Pure: the caller reads the bytes;
 * this decides.
 *
 * The type comes from the file's magic bytes, never its extension or the
 * browser's `File.type`. These checks run in the browser, so they are UX — a
 * refusal without a round trip. The check that counts is the upload function's
 * (supabase/functions/upload/files.ts), which also looks inside a zip for the
 * Word document a DOCX must hold; here a zip signature is enough to try.
 */

/** A hint for the file picker only; the bytes decide (§7.3). */
export const COVER_LETTER_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

/** Matches the cover-letters bucket's file_size_limit (10485760) and the upload function's cap. */
export const COVER_LETTER_MAX_BYTES = 10 * 1024 * 1024;

/** How many leading bytes sniffCoverLetterType needs. */
export const COVER_LETTER_SNIFF_BYTES = 8;

/** The applications_cl_name_len constraint. */
export const COVER_LETTER_NAME_MAX = 255;

export type CoverLetterType = 'pdf' | 'doc' | 'docx';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

/** PDF, DOC, or DOCX by signature; null for anything else. */
export function sniffCoverLetterType(bytes: Uint8Array): CoverLetterType | null {
  if (startsWith(bytes, PDF)) return 'pdf';
  if (startsWith(bytes, OLE2)) return 'doc';
  if (startsWith(bytes, ZIP)) return 'docx';
  return null;
}

export const COVER_LETTER_ERRORS = {
  type: 'Choose a PDF, DOC, or DOCX file.',
  size: 'Choose a file of 10 MB or less.',
  rateLimited: "You've uploaded a lot of files recently. Try again in an hour.",
} as const;

/** Type first, then size — the order the upload function refuses in. */
export function coverLetterProblem(file: { type: CoverLetterType | null; size: number }): string | null {
  if (file.type === null) return COVER_LETTER_ERRORS.type;
  if (file.size > COVER_LETTER_MAX_BYTES) return COVER_LETTER_ERRORS.size;
  return null;
}

/**
 * Characters that change how a name reads without being visible in it: C0 and
 * C1 controls, and the bidirectional overrides, isolates, and marks that make
 * `invoice\u202efdp.exe` display as `invoiceexe.pdf`. Also zero-width spaces and the
 * byte-order mark.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point: they are stripped.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;

const FALLBACK_NAME = 'Cover letter';

/**
 * The original filename as a display label (§2, §7.3) — never a path, never
 * trusted. React escapes it when it renders; this makes sure what it renders
 * reads as what it is:
 * - anything before a `/` or `\` goes (a browser sends none, another client might);
 * - invisible and direction-changing characters go;
 * - whitespace runs collapse, and the ends are trimmed;
 * - over 255 characters, the middle of the name gives way and the extension stays.
 *
 * Idempotent, so it runs both before the label is stored and before it is shown.
 */
export function coverLetterLabel(name: string): string {
  const base = name.normalize('NFC').split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return FALLBACK_NAME;

  // Code points, not UTF-16 units: Postgres char_length counts code points,
  // and cutting between a surrogate pair would leave half an emoji.
  const chars = Array.from(cleaned);
  if (chars.length <= COVER_LETTER_NAME_MAX) return cleaned;

  const dot = cleaned.lastIndexOf('.');
  const extension = dot > 0 ? Array.from(cleaned.slice(dot)) : [];
  const keep = extension.length > 0 && extension.length <= 10 ? extension : [];
  const stem = chars.slice(0, chars.length - keep.length);
  return [...stem.slice(0, COVER_LETTER_NAME_MAX - keep.length - 1), '…', ...keep].join('');
}

/**
 * Bytes as a person reads them: `812 bytes`, `24 KB`, `1.4 MB`. Binary units,
 * so the 10 MB cap in the copy is exactly 10,485,760 bytes.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? '1 byte' : `${bytes} bytes`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb.endsWith('.0') ? mb.slice(0, -2) : mb} MB`;
}
