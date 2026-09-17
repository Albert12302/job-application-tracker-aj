import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarChangedError } from '@/data/profile';
import { removeAvatar } from './remove-avatar';
import { setAvatar } from './set-avatar';

/**
 * The order these services do things in is the rule (SPEC §4.6, §9.4): the old
 * photo goes only after the profile points at the new one, a new photo nothing
 * points at does not survive, and a removal lets go of the profile before the
 * object. Every step is a stub that records itself, so the tests read the order back.
 */

const calls: string[] = [];
const uploadFile = vi.fn();
const setAvatarPath = vi.fn();
const removeAvatarObject = vi.fn();
const reportError = vi.fn();

vi.mock('@/data/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/storage')>()),
  uploadFile: (...args: unknown[]) => uploadFile(...args),
  removeAvatarObject: (...args: unknown[]) => removeAvatarObject(...args),
}));
vi.mock('@/data/profile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/profile')>()),
  setAvatarPath: (...args: unknown[]) => setAvatarPath(...args),
}));
vi.mock('@/data/security-events', () => ({ logSecurityEvent: async () => calls.push('log') }));
vi.mock('@/data/client', () => ({ supabase: {} }));
vi.mock('./report-error', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

const USER = '11111111-1111-1111-1111-111111111111';
const OLD = `${USER}/old.png`;
const NEW = `${USER}/new.png`;

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'me.png');

beforeEach(() => {
  calls.length = 0;
  // jsdom decodes no images; the dimension check needs a size to read.
  vi.stubGlobal('createImageBitmap', async () => ({ width: 100, height: 100, close: () => {} }));
  uploadFile.mockReset().mockImplementation(async () => {
    calls.push('upload');
    return NEW;
  });
  setAvatarPath.mockReset().mockImplementation(async (_user, next: string | null) => {
    calls.push(next ? `point at ${next}` : 'clear');
  });
  removeAvatarObject.mockReset().mockImplementation(async (path: string) => {
    calls.push(`delete ${path}`);
  });
  reportError.mockReset();
});

describe('setAvatar', () => {
  it('replaces: the profile is pointed at the new photo, guarded on the old one, before the old one is deleted', async () => {
    await expect(setAvatar(USER, png(), OLD)).resolves.toBe(NEW);

    expect(calls).toEqual(['upload', `point at ${NEW}`, `delete ${OLD}`, 'log']);
    expect(setAvatarPath).toHaveBeenCalledWith(USER, NEW, OLD);
  });

  it('sets a first photo guarded on there being none', async () => {
    await setAvatar(USER, png(), null);

    expect(calls).toEqual(['upload', `point at ${NEW}`]);
    expect(setAvatarPath).toHaveBeenCalledWith(USER, NEW, null);
  });

  it('when another tab changed the photo first: removes the new file and deletes nothing else', async () => {
    setAvatarPath.mockRejectedValue(new AvatarChangedError());

    await expect(setAvatar(USER, png(), OLD)).rejects.toBeInstanceOf(AvatarChangedError);
    expect(calls).toEqual(['upload', `delete ${NEW}`]);
    expect(removeAvatarObject).not.toHaveBeenCalledWith(OLD);
  });
});

describe('removeAvatar', () => {
  it('lets go of the profile first, guarded on the photo it is removing, then deletes the object', async () => {
    await removeAvatar(USER, OLD);

    expect(calls).toEqual(['clear', `delete ${OLD}`, 'log']);
    expect(setAvatarPath).toHaveBeenCalledWith(USER, null, OLD);
  });

  it('deletes nothing when another tab changed the photo first', async () => {
    setAvatarPath.mockRejectedValue(new AvatarChangedError());

    await expect(removeAvatar(USER, OLD)).rejects.toBeInstanceOf(AvatarChangedError);
    expect(removeAvatarObject).not.toHaveBeenCalled();
  });
});
