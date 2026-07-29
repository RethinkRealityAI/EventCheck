import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_FILTERS,
  ACCOUNT_FILTER_LABELS,
  matchesAccountFilter,
  describeActiveFilters,
  hasActiveFilters,
} from '../utils/attendeeQuickFilters';

describe('matchesAccountFilter', () => {
  it('"all" matches every row', () => {
    for (const row of [{ userId: 'u1' }, { userId: null }, {}]) {
      expect(matchesAccountFilter(row, 'all')).toBe(true);
    }
  });

  it('"linked" only matches rows with a portal login', () => {
    expect(matchesAccountFilter({ userId: 'u1' }, 'linked')).toBe(true);
    expect(matchesAccountFilter({ userId: null }, 'linked')).toBe(false);
    expect(matchesAccountFilter({}, 'linked')).toBe(false);
  });

  it('"none" finds the people who cannot sign in', () => {
    expect(matchesAccountFilter({ userId: null }, 'none')).toBe(true);
    expect(matchesAccountFilter({}, 'none')).toBe(true);
    // An empty-string user_id is not a login.
    expect(matchesAccountFilter({ userId: '' }, 'none')).toBe(true);
    expect(matchesAccountFilter({ userId: 'u1' }, 'none')).toBe(false);
  });

  it('linked and none partition every row exactly once', () => {
    for (const row of [{ userId: 'u1' }, { userId: null }, {}, { userId: '' }]) {
      const n = Number(matchesAccountFilter(row, 'linked')) + Number(matchesAccountFilter(row, 'none'));
      expect(n).toBe(1);
    }
  });

  it('has a label for every filter key', () => {
    for (const f of ACCOUNT_FILTERS) expect(ACCOUNT_FILTER_LABELS[f]).toBeTruthy();
  });
});

describe('describeActiveFilters', () => {
  it('returns nothing when everything is at its default', () => {
    expect(describeActiveFilters({})).toEqual([]);
    expect(describeActiveFilters({
      search: '', status: 'all', payment: 'all', account: 'all', responseFilterCount: 0,
    })).toEqual([]);
    expect(hasActiveFilters({ search: '   ', status: 'all' })).toBe(false);
  });

  it('describes each active filter in toolbar order', () => {
    const chips = describeActiveFilters({
      search: 'ojodu',
      status: 'checked-in',
      payment: 'paid',
      account: 'none',
      responseFilterCount: 2,
    });
    expect(chips.map(c => c.key)).toEqual(['search', 'status', 'payment', 'account', 'responses']);
    expect(chips[0].label).toBe('Search: "ojodu"');
    expect(chips[1].label).toBe('Checked in');
    expect(chips[3].label).toBe('No portal login');
    expect(chips[4].label).toBe('2 response filters');
  });

  it('singularises a lone response filter', () => {
    const chips = describeActiveFilters({ responseFilterCount: 1 });
    expect(chips[0].label).toBe('1 response filter');
  });

  it('trims the search term and ignores whitespace-only searches', () => {
    expect(describeActiveFilters({ search: '  jane  ' })[0].label).toBe('Search: "jane"');
    expect(describeActiveFilters({ search: '   ' })).toEqual([]);
  });

  it('falls back to the raw value for an unknown status/payment', () => {
    const chips = describeActiveFilters({ status: 'weird', payment: 'odd' });
    expect(chips.map(c => c.label)).toEqual(['weird', 'odd']);
  });

  it('hasActiveFilters agrees with describeActiveFilters', () => {
    expect(hasActiveFilters({ account: 'none' })).toBe(true);
    expect(hasActiveFilters({ payment: 'free' })).toBe(true);
    expect(hasActiveFilters({ account: 'all', payment: 'all' })).toBe(false);
  });
});
