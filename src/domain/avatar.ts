/**
 * Avatar upload rules (SPEC §7.3). Pure: the caller reads the bytes and decodes
 * the dimensions; this decides.
 *
 * The type comes from the file's magic bytes, never its extension or the
 * browser's `File.type` — both are whatever the file was named.
 *
 * These run in the browser, so they are UX: a refusal without a round trip.
 * The check that counts is the upload function's (supabase/functions/upload/
 * files.ts), which applies the same limits to the bytes it receives.
 */

export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

/** Matches the avatars bucket's file_size_limit (2097152) and the upload function's cap. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_DIMENSION = 4000;

/** How many leading bytes sniffAvatarType needs. */
export const AVATAR_SNIFF_BYTES = 12;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** PNG, JPEG, or WebP by signature; null for anything else — SVG included (§7.3). */
export function sniffAvatarType(bytes: Uint8Array): AvatarType | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'image/webp';
  return null;
}

export const AVATAR_ERRORS = {
  type: 'Choose a PNG, JPEG, or WebP image.',
  size: 'Choose an image of 2 MB or less.',
  dimensions: 'Choose an image no larger than 4000 × 4000 pixels.',
} as const;

/** Checks in the order that is cheapest to fail: type, then bytes, then pixels. */
export function avatarProblem(file: {
  type: AvatarType | null;
  size: number;
  width?: number;
  height?: number;
}): string | null {
  if (file.type === null) return AVATAR_ERRORS.type;
  if (file.size > AVATAR_MAX_BYTES) return AVATAR_ERRORS.size;
  if (
    file.width !== undefined &&
    file.height !== undefined &&
    (file.width > AVATAR_MAX_DIMENSION || file.height > AVATAR_MAX_DIMENSION)
  ) {
    return AVATAR_ERRORS.dimensions;
  }
  return null;
}
