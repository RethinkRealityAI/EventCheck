import { describe, it, expect } from 'vitest';
import {
  normalizePersonName,
  namesLookLikeSamePerson,
  pickAttendeeForContact,
} from '../supabase/functions/_shared/attendeeIdentity';

describe('normalizePersonName', () => {
  it('strips case, punctuation and extra whitespace', () => {
    expect(normalizePersonName('  Dr. Jane   O\'Brien-Smith ')).toBe('dr jane o brien smith');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizePersonName(null)).toBe('');
    expect(normalizePersonName(undefined)).toBe('');
    expect(normalizePersonName('   ')).toBe('');
  });
});

describe('namesLookLikeSamePerson', () => {
  it('matches identical and differently-punctuated names', () => {
    expect(namesLookLikeSamePerson('Jane Doe', 'jane  doe')).toBe(true);
    expect(namesLookLikeSamePerson('Jelili Ojodu', 'jelili.ojodu')).toBe(true);
  });

  it('matches when one name is a token-subset (title/middle name added)', () => {
    expect(namesLookLikeSamePerson('Jane Doe', 'Dr Jane Doe')).toBe(true);
    expect(namesLookLikeSamePerson('Jane Anne Doe', 'Jane Doe')).toBe(true);
  });

  it('does NOT match two different people sharing an address', () => {
    expect(namesLookLikeSamePerson('Jane Doe', 'John Smith')).toBe(false);
    expect(namesLookLikeSamePerson('Sikha Singh', 'Jelili Ojodu')).toBe(false);
  });

  it('never matches when either name is blank', () => {
    expect(namesLookLikeSamePerson('', 'Jane Doe')).toBe(false);
    expect(namesLookLikeSamePerson('Jane Doe', null)).toBe(false);
  });
});

describe('pickAttendeeForContact', () => {
  it('creates when no same-email row exists', () => {
    expect(pickAttendeeForContact({ contactName: 'Jane Doe', candidates: [] }))
      .toEqual({ action: 'create', reason: 'no-candidates' });
  });

  it('reuses the row belonging to the same person (re-invite dedupe still works)', () => {
    const r = pickAttendeeForContact({
      contactName: 'Jane Doe',
      candidates: [{ id: 'a1', name: 'Dr. Jane Doe', email: 'shared@x.co' }],
    });
    expect(r).toEqual({ action: 'reuse', attendeeId: 'a1', reason: 'name-match' });
  });

  it('picks the NAME-matching row when a partner shares the address', () => {
    const r = pickAttendeeForContact({
      contactName: 'Sikha Singh',
      candidates: [
        { id: 'payer', name: 'Jelili Ojodu', email: 'shared@aphl.org' },
        { id: 'guest', name: 'Sikha Singh', email: 'shared@aphl.org' },
      ],
    });
    expect(r).toEqual({ action: 'reuse', attendeeId: 'guest', reason: 'name-match' });
  });

  it('creates a NEW row rather than hijacking a different person on the same email', () => {
    const r = pickAttendeeForContact({
      contactName: 'Sikha Singh',
      candidates: [{ id: 'payer', name: 'Jelili Ojodu', email: 'shared@aphl.org' }],
    });
    expect(r).toEqual({ action: 'create', reason: 'different-person' });
  });

  it('never reuses a row already claimed by another imported contact', () => {
    const r = pickAttendeeForContact({
      contactName: 'Jane Doe',
      candidates: [{ id: 'a1', name: 'Jane Doe', email: 'shared@x.co' }],
      claimedByOtherContact: ['a1'],
    });
    expect(r).toEqual({ action: 'create', reason: 'all-claimed' });
  });

  it('reuses the sole unclaimed row when the contact has no name to compare', () => {
    const r = pickAttendeeForContact({
      contactName: '',
      candidates: [{ id: 'a1', name: 'Jane Doe', email: 'shared@x.co' }],
    });
    expect(r).toEqual({ action: 'reuse', attendeeId: 'a1', reason: 'sole-unclaimed' });
  });

  it('creates when the contact has no name and the address is ambiguous', () => {
    const r = pickAttendeeForContact({
      contactName: null,
      candidates: [
        { id: 'a1', name: 'Jane Doe', email: 'shared@x.co' },
        { id: 'a2', name: 'John Smith', email: 'shared@x.co' },
      ],
    });
    expect(r).toEqual({ action: 'create', reason: 'different-person' });
  });

  it('ignores malformed candidate rows', () => {
    const r = pickAttendeeForContact({
      contactName: 'Jane Doe',
      candidates: [{ id: '' } as any, null as any],
    });
    expect(r).toEqual({ action: 'create', reason: 'no-candidates' });
  });
});
