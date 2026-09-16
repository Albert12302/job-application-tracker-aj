import { describe, expect, it } from 'vitest';
import {
  AVATAR_ERRORS,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_DIMENSION,
  avatarProblem,
  sniffAvatarType,
} from './avatar';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(12).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('sniffAvatarType', () => {
  it('recognises the three accepted signatures', () => {
    expect(sniffAvatarType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffAvatarType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffAvatarType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')))).toBe('image/webp');
  });

  it('rejects SVG — a script execution vector (§7.3)', () => {
    expect(sniffAvatarType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
  });

  it('rejects a RIFF container that is not WebP', () => {
    expect(sniffAvatarType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')))).toBeNull();
  });

  it('rejects a PNG signature that is only nearly right', () => {
    expect(sniffAvatarType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00))).toBeNull();
  });

  it('rejects a file too short to carry a signature', () => {
    expect(sniffAvatarType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffAvatarType(new Uint8Array())).toBeNull();
  });
});

describe('avatarProblem', () => {
  const ok = { type: 'image/png' as const, size: 1000, width: 400, height: 400 };

  it('accepts a small image', () => {
    expect(avatarProblem(ok)).toBeNull();
  });

  it('reports the type first', () => {
    expect(avatarProblem({ ...ok, type: null, size: AVATAR_MAX_BYTES + 1 })).toBe(AVATAR_ERRORS.type);
  });

  it('allows exactly 2 MB and rejects a byte more', () => {
    expect(avatarProblem({ ...ok, size: AVATAR_MAX_BYTES })).toBeNull();
    expect(avatarProblem({ ...ok, size: AVATAR_MAX_BYTES + 1 })).toBe(AVATAR_ERRORS.size);
  });

  it('allows 4000 × 4000 and rejects either side over', () => {
    expect(avatarProblem({ ...ok, width: AVATAR_MAX_DIMENSION, height: AVATAR_MAX_DIMENSION })).toBeNull();
    expect(avatarProblem({ ...ok, width: AVATAR_MAX_DIMENSION + 1 })).toBe(AVATAR_ERRORS.dimensions);
    expect(avatarProblem({ ...ok, height: AVATAR_MAX_DIMENSION + 1 })).toBe(AVATAR_ERRORS.dimensions);
  });
});
