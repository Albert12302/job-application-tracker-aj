import { describe, expect, it } from 'vitest';
import { displayName, initialOf } from './profile';

describe('displayName', () => {
  it('prefers the profile name', () => {
    expect(displayName('Dev A', 'dev-a@example.test')).toBe('Dev A');
  });

  it('treats a blank profile name as unset', () => {
    expect(displayName('   ', 'joyce@example.test')).toBe('Joyce');
  });

  it('derives from the first word of the email local part', () => {
    expect(displayName(null, 'albert.szarek@example.test')).toBe('Albert');
    expect(displayName(null, 'dev-a@example.test')).toBe('Dev');
    expect(displayName(null, 'sam+jobs@example.test')).toBe('Sam');
  });

  it('never returns an empty string', () => {
    expect(displayName(null, null)).toBe('Account');
    expect(displayName(null, '@example.test')).toBe('Account');
    expect(displayName(undefined, '.hidden@example.test')).toBe('Account');
  });
});

describe('initialOf', () => {
  it('uppercases the first character', () => {
    expect(initialOf('albert')).toBe('A');
  });

  it('does not split a character made of two code units', () => {
    expect(initialOf('😀 Smile')).toBe('😀');
  });

  it('has a fallback for an empty name', () => {
    expect(initialOf('  ')).toBe('?');
  });
});
