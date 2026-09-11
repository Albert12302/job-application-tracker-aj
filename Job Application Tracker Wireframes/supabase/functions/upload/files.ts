// What the upload function accepts (SPEC §7.3). Pure — no Deno APIs — so
// Vitest runs it (files.test.ts); index.ts reads the body and stores the file.
//
// The type comes from the bytes, never the name or the Content-Type — both are
// whatever the sender chose. A file that claims a format but is cut short or
// malformed where these checks look is refused as the wrong type.
//
// This proves the format, not that the file is harmless: a hostile PDF is still
// a PDF. What protects the reader is how files are served — private buckets,
// attachment + nosniff, no SVG anywhere (§7.3).

export type UploadKind = 'avatar' | 'cover-letter';

/** Sizes match each bucket's file_size_limit, which stays as a backstop. */
export const UPLOAD_RULES = {
  avatar: { bucket: 'avatars', maxBytes: 2 * 1024 * 1024 },
  'cover-letter': { bucket: 'cover-letters', maxBytes: 10 * 1024 * 1024 },
} as const satisfies Record<UploadKind, { bucket: string; maxBytes: number }>;

export const AVATAR_MAX_DIMENSION = 4000;

export function isUploadKind(value: string): value is UploadKind {
  return Object.hasOwn(UPLOAD_RULES, value);
}

export type FileProblem = 'type' | 'size' | 'dimensions';
export type Verdict =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; problem: FileProblem };

type Detected = { contentType: string; extension: string };
type Image = Detected & { width: number; height: number };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(v: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(v.getUint8(offset + i));
  return s;
}

function pngSize(v: DataView): { width: number; height: number } | null {
  // IHDR is always the first chunk: length(4) type(4) width(4) height(4).
  if (ascii(v, 12, 4) !== String.fromCharCode(...IHDR)) return null;
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function jpegSize(v: DataView): { width: number; height: number } | null {
  let i = 2; // past SOI
  while (i + 4 <= v.byteLength) {
    if (v.getUint8(i) !== 0xff) return null;
    const marker = v.getUint8(i + 1);
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone markers carry no length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end, or scan data, before any frame header
    const length = v.getUint16(i + 2);
    if (length < 2) return null;
    // SOF0–SOF15, except DHT (C4), JPG (C8), DAC (CC), which share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(v: DataView): { width: number; height: number } | null {
  const u24 = (at: number) => v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getUint8(at + 2) << 16);
  switch (ascii(v, 12, 4)) {
    case 'VP8 ': // lossy: 3-byte frame tag, start code 9d 01 2a, then 14-bit sizes
      if (v.getUint8(23) !== 0x9d || v.getUint8(24) !== 0x01 || v.getUint8(25) !== 0x2a) return null;
      return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    case 'VP8L': {
      // lossless: signature 2f, then width−1 and height−1 in 14 bits each
      if (v.getUint8(20) !== 0x2f) return null;
      const bits = v.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8X': // extended: canvas width−1 and height−1, 24 bits each
      return { width: u24(24) + 1, height: u24(27) + 1 };
    default:
      return null;
  }
}

/** PNG, JPEG, or WebP with its pixel size from the header; null for anything else, SVG included. */
export function sniffImage(bytes: Uint8Array): Image | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    let found: (Detected & { size: { width: number; height: number } | null }) | null = null;
    if (startsWith(bytes, PNG)) found = { contentType: 'image/png', extension: 'png', size: pngSize(v) };
    else if (startsWith(bytes, JPEG)) found = { contentType: 'image/jpeg', extension: 'jpg', size: jpegSize(v) };
    else if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) {
      found = { contentType: 'image/webp', extension: 'webp', size: webpSize(v) };
    }
    if (!found?.size || found.size.width < 1 || found.size.height < 1) return null;
    return { contentType: found.contentType, extension: found.extension, ...found.size };
  } catch {
    return null; // a read past the end: the header is cut short
  }
}

/** Names in a zip's central directory, or null when it is not a well-formed one. */
function zipEntryNames(bytes: Uint8Array): string[] | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end record is the last 22 bytes, plus a comment of up to 65535.
  const lowest = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let end = bytes.byteLength - 22; end >= lowest; end--) {
    if (v.getUint32(end, true) !== ZIP_END) continue;
    const count = v.getUint16(end + 10, true);
    const size = v.getUint32(end + 12, true);
    const start = v.getUint32(end + 16, true);
    // The directory sits before its end record. Zip64 markers (0xffffffff) fail
    // here too — a 10 MB document never needs them.
    if (start + size > end) return null;

    const decoder = new TextDecoder();
    const names: string[] = [];
    let at = start;
    for (let n = 0; n < count; n++) {
      if (at + 46 > end || v.getUint32(at, true) !== ZIP_CENTRAL) return null;
      const nameLength = v.getUint16(at + 28, true);
      const next = at + 46 + nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true);
      if (next > end) return null;
      names.push(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)));
      at = next;
    }
    return names;
  }
  return null;
}

/**
 * PDF, DOC, or DOCX; null for anything else.
 *
 * DOCX is a zip, and the zip signature alone would pass any zip — a .jar, an
 * .xlsx — so it must also hold a Word document part. DOC is the OLE2 container,
 * which only the legacy Office formats use; telling a .doc from an .xls inside it
 * means walking the container's own file table, which is not done here.
 */
export function sniffDocument(bytes: Uint8Array): Detected | null {
  if (startsWith(bytes, PDF)) return { contentType: 'application/pdf', extension: 'pdf' };
  if (startsWith(bytes, OLE2)) return { contentType: 'application/msword', extension: 'doc' };
  if (startsWith(bytes, ZIP_LOCAL)) {
    let names: string[] | null;
    try {
      names = zipEntryNames(bytes);
    } catch {
      return null; // a read past the end
    }
    if (names?.includes('[Content_Types].xml') && names.includes('word/document.xml')) {
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extension: 'docx',
      };
    }
  }
  return null;
}

/**
 * The verdict on one file, checked in the order the client shows problems
 * (§4.6): type, then size, then pixels.
 */
export function checkUpload(kind: UploadKind, bytes: Uint8Array): Verdict {
  const { maxBytes } = UPLOAD_RULES[kind];

  if (kind === 'avatar') {
    const image = sniffImage(bytes);
    if (!image) return { ok: false, problem: 'type' };
    if (bytes.byteLength > maxBytes) return { ok: false, problem: 'size' };
    if (image.width > AVATAR_MAX_DIMENSION || image.height > AVATAR_MAX_DIMENSION) {
      return { ok: false, problem: 'dimensions' };
    }
    return { ok: true, contentType: image.contentType, extension: image.extension };
  }

  const document = sniffDocument(bytes);
  if (!document) return { ok: false, problem: 'type' };
  if (bytes.byteLength > maxBytes) return { ok: false, problem: 'size' };
  return { ok: true, ...document };
}
