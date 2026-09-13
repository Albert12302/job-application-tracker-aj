import { describe, expect, it } from 'vitest';
import { applicationCount, bulkDeleteFailure, companyList, deleteSummary } from './delete-summary';

describe('deleteSummary', () => {
  it('names notes and the file together (§9.2)', () => {
    expect(deleteSummary(3, 1)).toBe('This also deletes 3 notes and 1 attached file.');
  });

  it('counts one note as a note', () => {
    expect(deleteSummary(1, 0)).toBe('This also deletes 1 note.');
  });

  it('names the file on its own', () => {
    expect(deleteSummary(0, 1)).toBe('This also deletes 1 attached file.');
  });

  it('counts several files, for a delete of several applications', () => {
    expect(deleteSummary(5, 2)).toBe('This also deletes 5 notes and 2 attached files.');
  });

  it('says nothing extra when there is nothing else to delete', () => {
    expect(deleteSummary(0, 0)).toBeNull();
  });
});

describe('applicationCount', () => {
  it('is singular for one', () => {
    expect(applicationCount(1)).toBe('1 application');
    expect(applicationCount(4)).toBe('4 applications');
  });
});

describe('companyList', () => {
  it('names one, two, or a few companies as a sentence would', () => {
    expect(companyList(['Litware'])).toBe('Litware');
    expect(companyList(['Litware', 'Contoso'])).toBe('Litware and Contoso');
    expect(companyList(['Litware', 'Contoso', 'Fabrikam'])).toBe('Litware, Contoso, and Fabrikam');
  });

  it('names the first five and counts the rest', () => {
    expect(companyList(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])).toBe('A, B, C, D, E, and 3 more');
    expect(companyList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C, D, and E');
  });
});

describe('bulkDeleteFailure', () => {
  it('says how many went before the one that failed', () => {
    expect(bulkDeleteFailure(2, 5, 'Contoso')).toBe("Deleted 2 of 5 applications. Couldn't delete Contoso.");
  });

  it('names only the failure when nothing was deleted', () => {
    expect(bulkDeleteFailure(0, 3, 'Litware')).toBe("Couldn't delete Litware.");
  });
});
