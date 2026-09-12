import { describe, expect, it } from 'vitest';
import { deleteSummary } from './delete-summary';

describe('deleteSummary', () => {
  it('names notes and the file together (§9.2)', () => {
    expect(deleteSummary(3, true)).toBe('This also deletes 3 notes and 1 attached file.');
  });

  it('counts one note as a note', () => {
    expect(deleteSummary(1, false)).toBe('This also deletes 1 note.');
  });

  it('names the file on its own', () => {
    expect(deleteSummary(0, true)).toBe('This also deletes 1 attached file.');
  });

  it('says nothing extra when there is nothing else to delete', () => {
    expect(deleteSummary(0, false)).toBeNull();
  });
});
