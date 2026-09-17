import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarChangedError, setAvatarPath } from './profile';

/**
 * The guard on the profile's photo (§9.4): the path is written only if the
 * profile still holds the one the change started from. The client is a fake
 * that records each request's filters and answers from a queue.
 */

type Answer = { data?: unknown; error?: { code: string } | null };

const requests: string[] = [];
const answers: Answer[] = [];

function builder(start: string) {
  const parts = [start];
  const next = () => {
    const answer = answers.shift() ?? {};
    requests.push(parts.join(' '));
    return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
  };
  const chain = {
    eq: (column: string, value: unknown) => (parts.push(`${column}=${String(value)}`), chain),
    is: (column: string, value: unknown) => (parts.push(`${column} is ${String(value)}`), chain),
    select: () => chain,
    maybeSingle: next,
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => next().then(resolve, reject),
  };
  return chain;
}

vi.mock('./client', () => ({
  supabase: {
    from: () => ({
      update: (row: { avatar_path: string | null }) => builder(`update avatar_path=${String(row.avatar_path)}`),
      insert: (row: { avatar_path: string | null }) => builder(`insert avatar_path=${String(row.avatar_path)}`),
    }),
  },
}));

const USER = '11111111-1111-1111-1111-111111111111';
const OLD = `${USER}/old.png`;
const NEW = `${USER}/new.png`;

beforeEach(() => {
  requests.length = 0;
  answers.length = 0;
});

describe('setAvatarPath', () => {
  it('replaces only while the profile still holds the old photo', async () => {
    answers.push({ data: { id: USER } });

    await setAvatarPath(USER, NEW, OLD);
    expect(requests).toEqual([`update avatar_path=${NEW} id=${USER} avatar_path=${OLD}`]);
  });

  it('refuses when another tab replaced or removed the photo first', async () => {
    answers.push({ data: null });

    await expect(setAvatarPath(USER, NEW, OLD)).rejects.toBeInstanceOf(AvatarChangedError);
    expect(requests).toHaveLength(1);
  });

  it('sets a first photo only while the profile holds none', async () => {
    answers.push({ data: { id: USER } });

    await setAvatarPath(USER, NEW, null);
    expect(requests).toEqual([`update avatar_path=${NEW} id=${USER} avatar_path is null`]);
  });

  it('inserts the profile row when it is missing', async () => {
    answers.push({ data: null }, { error: null });

    await setAvatarPath(USER, NEW, null);
    expect(requests).toEqual([`update avatar_path=${NEW} id=${USER} avatar_path is null`, `insert avatar_path=${NEW}`]);
  });

  it('refuses when the row exists after all, holding a photo another tab set', async () => {
    answers.push({ data: null }, { error: { code: '23505' } });

    await expect(setAvatarPath(USER, NEW, null)).rejects.toBeInstanceOf(AvatarChangedError);
  });
});
