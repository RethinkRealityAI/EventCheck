import { describe, it, expect } from 'vitest';
import {
  recipientAddresses, suppressedAddresses, isSuppressedCategory,
} from '../supabase/functions/_shared/emailSuppression';

describe('recipientAddresses', () => {
  it('normalises strings, lists, display names and arrays', () => {
    expect(recipientAddresses(' DMHOMedchal@Gmail.com ')).toEqual(['dmhomedchal@gmail.com']);
    expect(recipientAddresses('a@x.org, "B" <b@x.org>; a@x.org')).toEqual(['a@x.org', 'b@x.org']);
    expect(recipientAddresses(['c@x.org', { address: 'D@x.org' }])).toEqual(['c@x.org', 'd@x.org']);
    expect(recipientAddresses(undefined)).toEqual([]);
  });
});

describe('suppressedAddresses', () => {
  const office = 'dmhomedchal@gmail.com';
  it('blocks an address held only by DMHO rows, whatever its case', () => {
    const rows = [
      { email: 'DMHOMEDCHAL@gmail.com', attendee_category: 'dmho' },
      { email: office, attendee_category: 'dmho' },
    ];
    expect(suppressedAddresses([office], rows)).toEqual([office]);
  });

  it('still emails a DMHO doctor who ALSO registered themselves', () => {
    const rows = [
      { email: 'doc@x.org', attendee_category: 'dmho' },
      { email: 'doc@x.org', attendee_category: null },
    ];
    expect(suppressedAddresses(['doc@x.org'], rows)).toEqual([]);
  });

  it('ignores test rows in both directions', () => {
    expect(suppressedAddresses(['t@x.org'], [{ email: 't@x.org', attendee_category: 'dmho', is_test: true }])).toEqual([]);
    expect(suppressedAddresses(['t@x.org'], [
      { email: 't@x.org', attendee_category: 'dmho' },
      { email: 't@x.org', attendee_category: null, is_test: true },
    ])).toEqual(['t@x.org']);
  });

  it('never blocks an address with no registrations (admins, contacts)', () => {
    expect(suppressedAddresses(['admin@x.org'], [{ email: office, attendee_category: 'dmho' }])).toEqual([]);
  });

  it('only DMHO is a never-email category', () => {
    expect(isSuppressedCategory('dmho')).toBe(true);
    expect(isSuppressedCategory('speaker')).toBe(false);
    expect(isSuppressedCategory(null)).toBe(false);
  });
});
