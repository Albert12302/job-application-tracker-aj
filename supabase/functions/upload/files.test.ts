import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_DIMENSION,
  checkUpload,
  isUploadKind,
  sniffDocument,
  sniffImage,
  UPLOAD_RULES,
} from './files.ts';

// Only the headers these checks read — the function never decodes pixels.

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array<number>(14).fill(0)];
  const sof = [0xff, 0xc0, 0x00, 0x11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3];
  return Uint8Array.from([0xff, 0xd8, ...app0, 0xff, 0xff, ...sof, ...new Array<number>(9).fill(0)]);
}

function webp(chunk: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number): Uint8Array {
  const b = new Uint8Array(40);
  const v = new DataView(b.buffer);
  b.set(new TextEncoder().encode(`RIFF\0\0\0\0WEBP${chunk}`));
  if (chunk === 'VP8 ') {
    b.set([0x9d, 0x01, 0x2a], 23);
    v.setUint16(26, width, true);
    v.setUint16(28, height, true);
  } else if (chunk === 'VP8L') {
    b[20] = 0x2f;
    v.setUint32(21, ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), true);
  } else {
    const u24 = (at: number, n: number) => b.set([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff], at);
    u24(24, width - 1);
    u24(27, height - 1);
  }
  return b;
}

/** A zip with these entry names in its central directory; entry contents are not read. */
function zip(names: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const local = [0x50, 0x4b, 0x03, 0x04, ...new Array<number>(26).fill(0)];
  const central: number[] = [];
  for (const name of names) {
    const encoded = encoder.encode(name);
    const header = new Uint8Array(46);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(28, encoded.length, true);
    central.push(...header, ...encoded);
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, names.length, true);
  e.setUint16(10, names.length, true);
  e.setUint32(12, central.length, true);
  e.setUint32(16, local.length, true);
  return Uint8Array.from([...local, ...central, ...end]);
}

const DOCX_PARTS = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const pdf = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n');
const doc = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

/** `bytes`, padded with zeros to `length` — the size check reads only the length. */
function padded(bytes: Uint8Array, length: number): Uint8Array {
  const b = new Uint8Array(length);
  b.set(bytes);
  return b;
}

describe('sniffImage', () => {
  it('reads type and size from PNG, JPEG, and all three WebP headers', () => {
    expect(sniffImage(png(640, 480))).toEqual({ contentType: 'image/png', extension: 'png', width: 640, height: 480 });
    expect(sniffImage(jpeg(800, 600))).toMatchObject({ contentType: 'image/jpeg', width: 800, height: 600 });
    for (const chunk of ['VP8 ', 'VP8L', 'VP8X'] as const) {
      expect(sniffImage(webp(chunk, 1200, 900))).toMatchObject({ contentType: 'image/webp', width: 1200, height: 900 });
    }
  });

  it('refuses SVG, however it is named', () => {
    expect(sniffImage(svg)).toBeNull();
  });

  it('refuses a real signature over a cut-short or malformed header', () => {
    expect(sniffImage(png(640, 480).subarray(0, 18))).toBeNull(); // IHDR cut off
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeNull();
    // Scan data before any frame header: no size to check, so no image.
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt '))).toBeNull();
  });

  it('refuses a zero-pixel image', () => {
    expect(sniffImage(png(0, 480))).toBeNull();
    expect(sniffImage(jpeg(800, 0))).toBeNull(); // height deferred to a DNL marker
  });

  it('checks the whole PNG signature, not just its start', () => {
    const almost = png(10, 10);
    almost[7] = 0x00;
    expect(sniffImage(almost)).toBeNull();
  });
});

describe('sniffDocument', () => {
  it('knows PDF, DOC, and DOCX', () => {
    expect(sniffDocument(pdf)?.extension).toBe('pdf');
    expect(sniffDocument(doc)?.extension).toBe('doc');
    expect(sniffDocument(zip(DOCX_PARTS))?.extension).toBe('docx');
  });

  it('refuses a zip that is not a Word document', () => {
    expect(sniffDocument(zip(['[Content_Types].xml', 'xl/workbook.xml']))).toBeNull(); // an .xlsx
    expect(sniffDocument(zip(['META-INF/MANIFEST.MF', 'Evil.class']))).toBeNull(); // a .jar
    expect(sniffDocument(zip([]))).toBeNull();
  });

  it('refuses a zip signature with no readable directory', () => {
    expect(sniffDocument(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull();
    const truncated = zip(DOCX_PARTS);
    expect(sniffDocument(truncated.subarray(0, truncated.length - 30))).toBeNull();
  });

  it('refuses a directory that points past its end record', () => {
    const bad = zip(DOCX_PARTS);
    new DataView(bad.buffer).setUint32(bad.length - 22 + 16, 0xffffffff, true); // a zip64 marker
    expect(sniffDocument(bad)).toBeNull();
  });

  it('refuses images, SVG, and text', () => {
    for (const bytes of [png(10, 10), svg, new TextEncoder().encode('Dear hiring manager')]) {
      expect(sniffDocument(bytes)).toBeNull();
    }
  });
});

describe('checkUpload', () => {
  it('accepts each allowed type for its own kind only', () => {
    expect(checkUpload('avatar', png(10, 10))).toEqual({ ok: true, contentType: 'image/png', extension: 'png' });
    expect(checkUpload('cover-letter', pdf)).toEqual({ ok: true, contentType: 'application/pdf', extension: 'pdf' });
    expect(checkUpload('avatar', pdf)).toEqual({ ok: false, problem: 'type' });
    expect(checkUpload('cover-letter', png(10, 10))).toEqual({ ok: false, problem: 'type' });
  });

  it('refuses SVG under both kinds (§7.3)', () => {
    expect(checkUpload('avatar', svg)).toEqual({ ok: false, problem: 'type' });
    expect(checkUpload('cover-letter', svg)).toEqual({ ok: false, problem: 'type' });
  });

  it('allows exactly the size cap, not a byte more', () => {
    const avatarMax = UPLOAD_RULES.avatar.maxBytes;
    expect(checkUpload('avatar', padded(png(10, 10), avatarMax)).ok).toBe(true);
    expect(checkUpload('avatar', padded(png(10, 10), avatarMax + 1))).toEqual({ ok: false, problem: 'size' });

    const letterMax = UPLOAD_RULES['cover-letter'].maxBytes;
    expect(checkUpload('cover-letter', padded(pdf, letterMax)).ok).toBe(true);
    expect(checkUpload('cover-letter', padded(pdf, letterMax + 1))).toEqual({ ok: false, problem: 'size' });
  });

  it('allows exactly 4000 × 4000, not a pixel more on either side', () => {
    const max = AVATAR_MAX_DIMENSION;
    expect(checkUpload('avatar', png(max, max)).ok).toBe(true);
    expect(checkUpload('avatar', png(max + 1, 10))).toEqual({ ok: false, problem: 'dimensions' });
    expect(checkUpload('avatar', jpeg(10, max + 1))).toEqual({ ok: false, problem: 'dimensions' });
    expect(checkUpload('avatar', webp('VP8X', max + 1, max + 1))).toEqual({ ok: false, problem: 'dimensions' });
  });

  it('reports type before size, as the client does', () => {
    expect(checkUpload('avatar', padded(svg, UPLOAD_RULES.avatar.maxBytes + 1))).toEqual({ ok: false, problem: 'type' });
  });
});

describe('isUploadKind', () => {
  it('knows the two kinds and nothing inherited', () => {
    expect(isUploadKind('avatar')).toBe(true);
    expect(isUploadKind('cover-letter')).toBe(true);
    for (const other of ['avatars', 'cover-letters', '', 'toString', '__proto__']) expect(isUploadKind(other)).toBe(false);
  });
});
