import { describe, expect, it } from 'vitest';
import {
  containsText,
  filterParam,
  matchesFilter,
  matchesSearch,
  namesSavedFilter,
  nextCustomName,
  noMatchesMessage,
  resolveFilter,
  savedFilterInput,
  tabCounts,
  visibleApplications,
  type FilterCriteria,
  type Filterable,
} from './filters';
import type { SavedFilter, SavedFilterFormValues } from './schemas';

const app = (overrides: Partial<Filterable> = {}): Filterable => ({
  company: 'Contoso',
  position: 'Product Engineer',
  location: 'Austin, TX',
  description: 'Small team, broad scope.',
  status: 'Applied',
  referral: false,
  starred: false,
  ...overrides,
});

const ANY: FilterCriteria = { statuses: [], referral: 'any', starred: 'any', location: null, text: null };

const saved = (overrides: Partial<SavedFilter> = {}): SavedFilter => ({
  id: crypto.randomUUID(),
  user_id: '11111111-1111-1111-1111-111111111111',
  name: 'Live',
  created_at: '2026-09-01T10:00:00+00:00',
  ...ANY,
  ...overrides,
});

describe('containsText', () => {
  it('matches everything when the term is empty or only spaces', () => {
    expect(containsText(['x'], '')).toBe(true);
    expect(containsText(['x'], '   ')).toBe(true);
    expect(containsText([null], null)).toBe(true);
  });

  it('ignores case and the outer spaces of the term', () => {
    expect(containsText(['Northwind Traders'], '  nORTHwind ')).toBe(true);
  });

  it('keeps the spaces inside the term', () => {
    expect(containsText(['Northwind Traders'], 'wind trad')).toBe(true);
    expect(containsText(['Northwind Traders'], 'windtrad')).toBe(false);
  });

  it('never matches across two fields', () => {
    expect(containsText(['Contoso', 'Product Engineer'], 'osoProd')).toBe(false);
    expect(containsText(['Contoso', 'Product Engineer'], 'Contoso Product')).toBe(false);
  });

  it('skips missing fields', () => {
    expect(containsText([null, 'Remote'], 'remote')).toBe(true);
    expect(containsText([null], 'x')).toBe(false);
  });
});

describe('matchesFilter (§5.1)', () => {
  it('matches everything when every test is at its default', () => {
    expect(matchesFilter(app(), ANY)).toBe(true);
  });

  it('statuses: empty means all, otherwise the status must be listed', () => {
    expect(matchesFilter(app({ status: 'Offer' }), { ...ANY, statuses: ['Interview', 'Offer'] })).toBe(true);
    expect(matchesFilter(app({ status: 'Applied' }), { ...ANY, statuses: ['Interview', 'Offer'] })).toBe(false);
  });

  it('referral: any, yes, or no against the flag', () => {
    expect(matchesFilter(app({ referral: true }), { ...ANY, referral: 'yes' })).toBe(true);
    expect(matchesFilter(app({ referral: false }), { ...ANY, referral: 'yes' })).toBe(false);
    expect(matchesFilter(app({ referral: false }), { ...ANY, referral: 'no' })).toBe(true);
    expect(matchesFilter(app({ referral: true }), { ...ANY, referral: 'no' })).toBe(false);
  });

  it('starred: any, yes, or no against the flag', () => {
    expect(matchesFilter(app({ starred: true }), { ...ANY, starred: 'yes' })).toBe(true);
    expect(matchesFilter(app({ starred: false }), { ...ANY, starred: 'yes' })).toBe(false);
    expect(matchesFilter(app({ starred: false }), { ...ANY, starred: 'no' })).toBe(true);
    expect(matchesFilter(app({ starred: true }), { ...ANY, starred: 'no' })).toBe(false);
  });

  it('location: an exact match, case included, and no location never matches one', () => {
    expect(matchesFilter(app({ location: 'Austin, TX' }), { ...ANY, location: 'Austin, TX' })).toBe(true);
    expect(matchesFilter(app({ location: 'austin, tx' }), { ...ANY, location: 'Austin, TX' })).toBe(false);
    expect(matchesFilter(app({ location: 'Austin, TX, USA' }), { ...ANY, location: 'Austin, TX' })).toBe(false);
    expect(matchesFilter(app({ location: null }), { ...ANY, location: 'Austin, TX' })).toBe(false);
  });

  it('text: company, position, location, or description', () => {
    expect(matchesFilter(app(), { ...ANY, text: 'contoso' })).toBe(true);
    expect(matchesFilter(app(), { ...ANY, text: 'engineer' })).toBe(true);
    expect(matchesFilter(app(), { ...ANY, text: 'austin' })).toBe(true);
    expect(matchesFilter(app(), { ...ANY, text: 'broad scope' })).toBe(true);
    expect(matchesFilter(app({ description: null }), { ...ANY, text: 'broad scope' })).toBe(false);
  });

  it('needs every test to pass', () => {
    const criteria: FilterCriteria = { statuses: ['Interview'], referral: 'yes', starred: 'any', location: 'Austin, TX', text: null };
    expect(matchesFilter(app({ status: 'Interview', referral: true }), criteria)).toBe(true);
    expect(matchesFilter(app({ status: 'Interview', referral: false }), criteria)).toBe(false);
    expect(matchesFilter(app({ status: 'Interview', referral: true, location: 'Remote' }), criteria)).toBe(false);
  });
});

describe('matchesSearch (§5.1)', () => {
  it('matches company, position, and location', () => {
    expect(matchesSearch(app(), 'CONTOSO')).toBe(true);
    expect(matchesSearch(app(), 'product')).toBe(true);
    expect(matchesSearch(app(), 'tx')).toBe(true);
  });

  it('never matches the description', () => {
    expect(matchesSearch(app(), 'broad scope')).toBe(false);
  });
});

describe('resolveFilter', () => {
  const live = saved({ name: 'Live' });

  it('reads All, a status, and a saved filter', () => {
    expect(resolveFilter('all', [live])).toEqual({ kind: 'all' });
    expect(resolveFilter('Offer', [live])).toEqual({ kind: 'status', status: 'Offer' });
    expect(resolveFilter(live.id, [live])).toEqual({ kind: 'saved', filter: live });
  });

  it('falls back to All for a saved filter that is gone, unknown, or not loaded', () => {
    expect(resolveFilter(crypto.randomUUID(), [live])).toEqual({ kind: 'all' });
    expect(resolveFilter(live.id, undefined)).toEqual({ kind: 'all' });
    expect(resolveFilter('offer', [live])).toEqual({ kind: 'all' });
  });

  it('round-trips through the URL value', () => {
    for (const param of ['all', 'Interview', live.id]) {
      expect(filterParam(resolveFilter(param, [live]))).toBe(param);
    }
  });

  it('knows which values name a saved filter', () => {
    expect(namesSavedFilter('all')).toBe(false);
    expect(namesSavedFilter('Withdrawn')).toBe(false);
    expect(namesSavedFilter(live.id)).toBe(true);
  });
});

describe('visibleApplications', () => {
  const rows = [
    app({ company: 'Northwind', status: 'Callback', referral: true }),
    app({ company: 'Contoso', status: 'Interview' }),
    app({ company: 'Fabrikam', status: 'Offer', description: 'Northwind alumni' }),
  ];

  it('applies the search on top of the active filter, keeping order', () => {
    const live = saved({ statuses: ['Interview', 'Callback', 'Offer'] });
    expect(visibleApplications(rows, { kind: 'saved', filter: live }, '').map((row) => row.company)).toEqual([
      'Northwind',
      'Contoso',
      'Fabrikam',
    ]);
    expect(visibleApplications(rows, { kind: 'saved', filter: live }, 'north').map((row) => row.company)).toEqual([
      'Northwind',
    ]);
    expect(visibleApplications(rows, { kind: 'status', status: 'Interview' }, 'north')).toEqual([]);
    expect(visibleApplications(rows, { kind: 'all' }, 'fab').map((row) => row.company)).toEqual(['Fabrikam']);
  });
});

describe('tabCounts (§5.3)', () => {
  it('counts All, every status (zeros included), and every saved filter over the whole set', () => {
    const referrals = saved({ referral: 'yes' });
    const nothing = saved({ statuses: ['Withdrawn'] });
    const counts = tabCounts(
      [app({ status: 'Applied', referral: true }), app({ status: 'Applied' }), app({ status: 'Offer', referral: true })],
      [referrals, nothing],
    );
    expect(counts.all).toBe(3);
    expect(counts.byStatus).toEqual({ Applied: 2, Interview: 0, Callback: 0, Offer: 1, Rejected: 0, Withdrawn: 0 });
    expect(counts.bySavedFilter).toEqual({ [referrals.id]: 2, [nothing.id]: 0 });
  });
});

describe('nextCustomName (§2)', () => {
  it('starts at Custom 1', () => {
    expect(nextCustomName([])).toBe('Custom 1');
    expect(nextCustomName(['Live', 'Austin referrals'])).toBe('Custom 1');
  });

  it('is one more than the highest Custom N, so a deleted number is not reused', () => {
    expect(nextCustomName(['Custom 1', 'Custom 2'])).toBe('Custom 3');
    expect(nextCustomName(['Custom 3'])).toBe('Custom 4');
  });

  it('ignores names that only look similar', () => {
    expect(nextCustomName(['Custom', 'custom 5', 'Custom 2b', 'My Custom 9'])).toBe('Custom 1');
  });
});

describe('savedFilterInput', () => {
  const values: SavedFilterFormValues = { name: '', statuses: [], referral: 'any', starred: 'any', location: null, text: '' };

  it('names a blank filter Custom N and stores a blank text match as null', () => {
    expect(savedFilterInput({ ...values, name: '   ', text: '  ' }, ['Custom 1'])).toMatchObject({
      name: 'Custom 2',
      text: null,
    });
  });

  it('keeps a given name and text, trimmed, and puts statuses in their fixed order', () => {
    expect(
      savedFilterInput({ ...values, name: ' Warm leads ', text: ' design ', statuses: ['Offer', 'Applied'] }, []),
    ).toMatchObject({ name: 'Warm leads', text: 'design', statuses: ['Applied', 'Offer'] });
  });
});

describe('noMatchesMessage (§8.2)', () => {
  const live = saved({ name: 'Live' });

  it('names the filter, the search, or both', () => {
    expect(noMatchesMessage({ kind: 'status', status: 'Offer' }, ' acme ')).toBe('No applications in Offer match "acme".');
    expect(noMatchesMessage({ kind: 'saved', filter: live }, '')).toBe('No applications in Live.');
    expect(noMatchesMessage({ kind: 'all' }, 'acme')).toBe('No applications match "acme".');
  });
});
