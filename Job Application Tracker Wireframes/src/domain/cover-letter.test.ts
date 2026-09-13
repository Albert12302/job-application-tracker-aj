import { describe, expect, it } from 'vitest';
import {
  COVER_LETTER_ERRORS,
  COVER_LETTER_MAX_BYTES,
  COVER_LETTER_NAME_MAX,
  coverLetterLabel,
  coverLetterProblem,
  formatFileSize,
  sniffCoverLetterType,
} from './cover-letter';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(8).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('sniffCoverLetterType', () => {
  it('recognises the three accepted signatures', () => {
    expect(sniffCoverLetterType(bytes(...ascii('%PDF-1.7')))).toBe('pdf');
    expect(sniffCoverLetterType(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe('doc');
    expect(sniffCoverLetterType(bytes(0x50, 0x4b, 0x03, 0x04))).toBe('docx');
  });

  it('rejects SVG and HTML, whatever they are named (§7.3)', () => {
    expect(sniffCoverLetterType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffCoverLetterType(new TextEncoder().encode('<!doctype html><script>'))).toBeNull();
  });

  it('rejects "%PDF" without the dash, and a file too short to carry a signature', () => {
    expect(sniffCoverLetterType(bytes(...ascii('%PDF')))).toBeNull();
    expect(sniffCoverLetterType(new Uint8Array([0x25, 0x50]))).toBeNull();
    expect(sniffCoverLetterType(new Uint8Array())).toBeNull();
  });

  it('rejects images', () => {
    expect(sniffCoverLetterType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBeNull();
  });
});

describe('coverLetterProblem', () => {
  it('accepts a small document', () => {
    expect(coverLetterProblem({ type: 'pdf', size: 20_000 })).toBeNull();
  });

  it('reports the type first', () => {
    expect(coverLetterProblem({ type: null, size: COVER_LETTER_MAX_BYTES + 1 })).toBe(COVER_LETTER_ERRORS.type);
  });

  it('allows exactly 10 MB and rejects a byte more', () => {
    expect(coverLetterProblem({ type: 'docx', size: COVER_LETTER_MAX_BYTES })).toBeNull();
    expect(coverLetterProblem({ type: 'docx', size: COVER_LETTER_MAX_BYTES + 1 })).toBe(COVER_LETTER_ERRORS.size);
  });
});

describe('coverLetterLabel', () => {
  it('leaves an ordinary name alone', () => {
    expect(coverLetterLabel('Acme cover letter (final).pdf')).toBe('Acme cover letter (final).pdf');
  });

  it('keeps markup as the characters it is — escaping is the renderer’s job', () => {
    expect(coverLetterLabel('<img src=x onerror=alert(1)>.pdf')).toBe('<img src=x onerror=alert(1)>.pdf');
  });

  it('drops a direction override that disguises the extension', () => {
    expect(coverLetterLabel('invoice\u202efdp.exe')).toBe('invoicefdp.exe');
    expect(coverLetterLabel('a\u2066b\u2069\u200f.pdf')).toBe('ab.pdf');
  });

  it('drops control characters, zero-width spaces, and a byte-order mark', () => {
    expect(coverLetterLabel('\ufeffcover\u0000\u200b letter\u0085.pdf')).toBe('cover letter.pdf');
  });

  it('collapses whitespace, newlines included, and trims the ends', () => {
    expect(coverLetterLabel('  cover \n\t letter.pdf  ')).toBe('cover letter.pdf');
  });

  it('keeps only the last path segment', () => {
    expect(coverLetterLabel('C:\\Users\\sam\\cover.pdf')).toBe('cover.pdf');
    expect(coverLetterLabel('../../etc/cover.pdf')).toBe('cover.pdf');
  });

  it('falls back to a plain label when nothing readable is left', () => {
    expect(coverLetterLabel('')).toBe('Cover letter');
    expect(coverLetterLabel(' \u202e\u200b ')).toBe('Cover letter');
    expect(coverLetterLabel('folder/')).toBe('Cover letter');
  });

  it('shortens a long name to the column cap, keeping the extension', () => {
    const label = coverLetterLabel(`${'a'.repeat(400)}.docx`);
    expect(Array.from(label)).toHaveLength(COVER_LETTER_NAME_MAX);
    expect(label.endsWith('….docx')).toBe(true);
  });

  it('counts code points, and never cuts an emoji in half', () => {
    const label = coverLetterLabel(`${'📄'.repeat(300)}.pdf`);
    expect(Array.from(label)).toHaveLength(COVER_LETTER_NAME_MAX);
    expect(label).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    // Exactly at the cap is left whole.
    const atCap = `${'b'.repeat(COVER_LETTER_NAME_MAX - 4)}.pdf`;
    expect(coverLetterLabel(atCap)).toBe(atCap);
  });

  it('shortens a long name with no usable extension from the end', () => {
    const label = coverLetterLabel('c'.repeat(300));
    expect(Array.from(label)).toHaveLength(COVER_LETTER_NAME_MAX);
    expect(label.endsWith('c…')).toBe(true);
  });

  it('is idempotent', () => {
    for (const name of ['x\u202e.pdf', `${'a'.repeat(400)}.pdf`, '  a  b .doc', '']) {
      const once = coverLetterLabel(name);
      expect(coverLetterLabel(once)).toBe(once);
    }
  });
});

describe('formatFileSize', () => {
  it('counts small files in bytes', () => {
    expect(formatFileSize(0)).toBe('0 bytes');
    expect(formatFileSize(1)).toBe('1 byte');
    expect(formatFileSize(1023)).toBe('1023 bytes');
  });

  it('uses whole kilobytes below a megabyte', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(24_300)).toBe('24 KB');
  });

  it('never shows 1024 KB — that is a megabyte', () => {
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1 MB');
  });

  it('uses megabytes to one decimal, without a trailing .0', () => {
    expect(formatFileSize(1_468_006)).toBe('1.4 MB');
    expect(formatFileSize(COVER_LETTER_MAX_BYTES)).toBe('10 MB');
  });
});
