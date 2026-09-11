import { describe, expect, it } from 'vitest';
import { normalizeLocation } from './location';

describe('normalizeLocation', () => {
  it('title-cases each part and uppercases two-letter parts', () => {
    expect(normalizeLocation('austin, tx', [])).toBe('Austin, TX');
    expect(normalizeLocation('new york, ny', [])).toBe('New York, NY');
  });

  it('trims and collapses whitespace, including around commas', () => {
    expect(normalizeLocation('  san   francisco ,  ca ', [])).toBe('San Francisco, CA');
    expect(normalizeLocation('austin,tx', [])).toBe('Austin, TX');
  });

  it('drops empty parts left by stray commas', () => {
    expect(normalizeLocation('austin,, tx,', [])).toBe('Austin, TX');
  });

  it('lets an existing spelling win, matched case-insensitively', () => {
    expect(normalizeLocation('san francisco, ca', ['San Francisco, CA'])).toBe('San Francisco, CA');
    expect(normalizeLocation('REMOTE', ['Remote'])).toBe('Remote');
  });

  it('matches an existing spelling regardless of comma spacing', () => {
    expect(normalizeLocation('austin,tx', ['Austin, TX'])).toBe('Austin, TX');
  });

  it('keeps an existing spelling exactly, even one title-casing would not produce', () => {
    expect(normalizeLocation('seattle, wa', ['Seattle, Wa'])).toBe('Seattle, Wa');
  });

  it('ignores applications with no location', () => {
    expect(normalizeLocation('denver, co', [null, 'Remote'])).toBe('Denver, CO');
  });

  it('never lowers letters the user capitalised', () => {
    expect(normalizeLocation('McAllen, tx', [])).toBe('McAllen, TX');
    expect(normalizeLocation('REMOTE', [])).toBe('REMOTE');
  });

  it('capitalises after a hyphen', () => {
    expect(normalizeLocation('winston-salem, nc', [])).toBe('Winston-Salem, NC');
  });

  it('only uppercases two-letter parts, not two-letter words', () => {
    expect(normalizeLocation('st louis, mo', [])).toBe('St Louis, MO');
    expect(normalizeLocation('uk', [])).toBe('UK');
  });

  it('title-cases letters outside ASCII', () => {
    expect(normalizeLocation('são paulo', [])).toBe('São Paulo');
    expect(normalizeLocation('zürich', [])).toBe('Zürich');
  });

  it('returns null for nothing at all', () => {
    expect(normalizeLocation('', [])).toBeNull();
    expect(normalizeLocation('   ', [])).toBeNull();
    expect(normalizeLocation(' , ', [])).toBeNull();
    expect(normalizeLocation(undefined, [])).toBeNull();
    expect(normalizeLocation(null, ['Remote'])).toBeNull();
  });
});
