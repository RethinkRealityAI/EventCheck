import { describe, it, expect } from 'vitest';
import {
  buildRegistrationIndex,
  delegateOrgName,
  delegateStatus,
  matchesRegistrationKindFilter,
  orgDisplayName,
  resolveOrgKind,
  resolveRegistrationKind,
  summarizeRegistrations,
  guestContactStatus,
  isEmailableRecipient,
  isPendingGuest,
  REGISTRATION_KIND_FILTERS,
  REGISTRATION_KIND_META,
  type KindInput,
} from '../utils/registrationKind';

const FORM_TYPES: Record<string, string> = {
  congress: 'event',
  staff: 'event',
  combined: 'sponsor_exhibitor',
  'legacy-sponsor': 'sponsor',
  'legacy-exhibitor': 'exhibitor',
};
const formTypeOf = (id?: string | null) => (id ? FORM_TYPES[id] : undefined);

// The shape reported: a sponsor's booking row plus its delegation, sitting
// next to ordinary registrants.
const pfizer: KindInput = {
  id: 'org-pfizer', formId: 'combined', isPrimary: true, sponsorTier: 'gold',
  companyInfo: { orgName: 'Pfizer, Inc', contactName: 'Dana Osei' }, name: 'Pfizer, Inc [Sponsor]',
};
const pfizerClaimed: KindInput = { id: 'd1', formId: 'staff', isPrimary: false, primaryAttendeeId: 'org-pfizer', guestType: 'staff-claimed', name: 'Amara Bello' };
const pfizerPending: KindInput = { id: 'd2', formId: 'staff', isPrimary: false, primaryAttendeeId: 'org-pfizer', guestType: 'staff-pending', name: 'Pfizer, Inc — Staff slot #2' };
// Filled in fully by the org at booking time → no guest_type at all.
const pfizerInline: KindInput = { id: 'd3', formId: 'staff', isPrimary: false, primaryAttendeeId: 'org-pfizer', guestType: null, name: 'Chen Wei' };
const novo: KindInput = { id: 'org-novo', formId: 'combined', isPrimary: true, exhibitorBoothType: 'booth_3x3', companyInfo: { orgName: 'Novo Nordisk' }, name: 'Novo Nordisk [Exhibitor]' };
const novoStaff: KindInput = { id: 'd4', formId: 'staff', isPrimary: false, primaryAttendeeId: 'org-novo', guestType: 'exhibitor-staff-pending', name: 'Lars Holm' };
const solo: KindInput = { id: 'a1', formId: 'congress', isPrimary: true, name: 'Grace Mensah' };
const groupPrimary: KindInput = { id: 'a2', formId: 'congress', isPrimary: true, name: 'Ravi Iyer' };
const groupGuest: KindInput = { id: 'a3', formId: 'congress', isPrimary: false, primaryAttendeeId: 'a2', guestType: 'claimed', name: 'Priya Iyer' };
const bogoGuest: KindInput = { id: 'a4', formId: 'congress', isPrimary: true, guestType: undefined, name: 'Free Guest' };
const testRow: KindInput = { id: 't1', formId: 'congress', isPrimary: true, isTest: true, name: 'Preview' };

const ALL = [pfizer, pfizerClaimed, pfizerPending, pfizerInline, novo, novoStaff, solo, groupPrimary, groupGuest, bogoGuest, testRow];

describe('resolveOrgKind', () => {
  it('reads what was bought before the form type', () => {
    expect(resolveOrgKind(pfizer, formTypeOf)).toBe('sponsor');
    expect(resolveOrgKind(novo, formTypeOf)).toBe('exhibitor');
    expect(resolveOrgKind({ ...pfizer, exhibitorBoothType: 'booth_3x3' }, formTypeOf)).toBe('sponsor-exhibitor');
  });

  it('falls back to the form type for rows with no tier or booth', () => {
    expect(resolveOrgKind({ id: 'x', formId: 'legacy-sponsor', isPrimary: true }, formTypeOf)).toBe('sponsor');
    expect(resolveOrgKind({ id: 'x', formId: 'legacy-exhibitor', isPrimary: true }, formTypeOf)).toBe('exhibitor');
    expect(resolveOrgKind({ id: 'x', formId: 'combined', isPrimary: true }, formTypeOf)).toBe('sponsor-exhibitor');
  });

  it('recognises the legacy Exhibitor ticket type without a form lookup', () => {
    expect(resolveOrgKind({ id: 'x', isPrimary: true, ticketType: 'Exhibitor' })).toBe('exhibitor');
  });

  it('never calls a non-primary row an org, even with a tier on it', () => {
    expect(resolveOrgKind({ ...pfizer, isPrimary: false, primaryAttendeeId: 'z' }, formTypeOf)).toBeNull();
  });

  it('is null for ordinary attendees', () => {
    expect(resolveOrgKind(solo, formTypeOf)).toBeNull();
    expect(resolveOrgKind(groupPrimary, formTypeOf)).toBeNull();
  });
});

describe('buildRegistrationIndex', () => {
  const index = buildRegistrationIndex(ALL, formTypeOf);

  it('classifies every row exactly once', () => {
    expect(index.kindById.size).toBe(ALL.length);
  });

  it('puts the whole Pfizer delegation under delegate — claimed, pending and inline alike', () => {
    for (const id of ['d1', 'd2', 'd3']) expect(resolveRegistrationKind(index, id)).toBe('delegate');
    expect(delegateOrgName(index, 'd1')).toBe('Pfizer, Inc');
    expect(delegateOrgName(index, 'd3')).toBe('Pfizer, Inc');
  });

  it('keeps group guests and free guests as attendees, not delegates', () => {
    expect(resolveRegistrationKind(index, 'a3')).toBe('attendee');
    expect(resolveRegistrationKind(index, 'a4')).toBe('attendee');
    expect(delegateOrgName(index, 'a3')).toBeNull();
  });

  it('still finds a delegate whose org booking was deleted (by guest_type)', () => {
    const orphan: KindInput = { id: 'o1', isPrimary: false, primaryAttendeeId: 'gone', guestType: 'staff-pending' };
    const idx = buildRegistrationIndex([orphan], formTypeOf);
    expect(resolveRegistrationKind(idx, 'o1')).toBe('delegate');
    expect(delegateOrgName(idx, 'o1')).toBeNull();
  });

  it('defaults an unknown id to attendee', () => {
    expect(resolveRegistrationKind(index, 'nope')).toBe('attendee');
  });
});

describe('orgDisplayName / delegateStatus', () => {
  it('prefers the company name over the booking row name', () => {
    expect(orgDisplayName(pfizer)).toBe('Pfizer, Inc');
    expect(orgDisplayName({ name: 'Acme [Sponsor]', companyInfo: { orgName: '  ' } })).toBe('Acme [Sponsor]');
    expect(orgDisplayName({ name: '', companyInfo: null })).toBe('Organization');
  });

  it('marks staff-pending and exhibitor-staff-pending as pending', () => {
    expect(delegateStatus(pfizerPending)).toBe('pending');
    expect(delegateStatus(novoStaff)).toBe('pending');
  });

  it('treats claimed and inline-complete delegates as registered', () => {
    expect(delegateStatus(pfizerClaimed)).toBe('registered');
    expect(delegateStatus(pfizerInline)).toBe('registered');
  });

  it('uses the legacy placeholder name when guest_type is absent', () => {
    expect(delegateStatus({ guestType: null, name: 'Acme - Guest Ticket #3' })).toBe('pending');
  });
});

describe('matchesRegistrationKindFilter', () => {
  it('"all" matches every kind', () => {
    for (const k of Object.keys(REGISTRATION_KIND_META) as Array<keyof typeof REGISTRATION_KIND_META>) {
      expect(matchesRegistrationKindFilter(k, 'all')).toBe(true);
    }
  });

  it('sponsor + exhibitor bookings show under both sponsors and exhibitors', () => {
    expect(matchesRegistrationKindFilter('sponsor-exhibitor', 'sponsors')).toBe(true);
    expect(matchesRegistrationKindFilter('sponsor-exhibitor', 'exhibitors')).toBe(true);
    expect(matchesRegistrationKindFilter('sponsor', 'exhibitors')).toBe(false);
    expect(matchesRegistrationKindFilter('exhibitor', 'sponsors')).toBe(false);
  });

  it('delegates and attendees are disjoint buckets', () => {
    expect(matchesRegistrationKindFilter('delegate', 'delegates')).toBe(true);
    expect(matchesRegistrationKindFilter('delegate', 'attendees')).toBe(false);
    expect(matchesRegistrationKindFilter('attendee', 'attendees')).toBe(true);
    expect(matchesRegistrationKindFilter('attendee', 'orgs')).toBe(false);
    expect(matchesRegistrationKindFilter('sponsor', 'orgs')).toBe(true);
  });

  it('every filter key has a label', () => {
    for (const f of REGISTRATION_KIND_FILTERS) {
      expect(typeof f).toBe('string');
    }
  });
});

describe('summarizeRegistrations', () => {
  it('rolls up counts and ignores test rows', () => {
    const index = buildRegistrationIndex(ALL, formTypeOf);
    const s = summarizeRegistrations(ALL, index);
    expect(s.total).toBe(ALL.length - 1);
    expect(s.attendees).toBe(4);
    expect(s.delegates).toBe(4);
    expect(s.delegatesRegistered).toBe(2);
    expect(s.delegatesPending).toBe(2);
    expect(s.orgs).toBe(2);
    expect(s.sponsors).toBe(1);
    expect(s.exhibitors).toBe(1);
  });

  it('counts a combined booking as both a sponsor and an exhibitor', () => {
    const combined: KindInput = { ...pfizer, exhibitorBoothType: 'booth_3x3' };
    const index = buildRegistrationIndex([combined], formTypeOf);
    const s = summarizeRegistrations([combined], index);
    expect(s.orgs).toBe(1);
    expect(s.sponsors).toBe(1);
    expect(s.exhibitors).toBe(1);
  });
});

// ── Reachability ──────────────────────────────────────────────────────────
//
// Two separate questions that used to be conflated: is there a person on this
// row at all, and can we write to them independently of the purchaser?

describe('isPendingGuest', () => {
  // Every case is a COMPANION row; a booking's own row is never hidden.
  const seat = (over: Record<string, unknown>) => ({ isPrimary: false, primaryAttendeeId: 'p', ...over });

  it('recognises every placeholder name the platform issues', () => {
    expect(isPendingGuest(seat({ name: 'Acme - Guest Ticket #3', email: 'x@y.com' }))).toBe(true);
    expect(isPendingGuest(seat({ name: 'aditi - Free Guest (pending)', email: 'x@y.com' }))).toBe(true);
    expect(isPendingGuest(seat({ name: 'Varun - Guest (pending)', email: 'x@y.com' }))).toBe(true);
    expect(isPendingGuest(seat({ name: 'Acme — Staff slot #3', email: 'x@y.com' }))).toBe(true);
    // "- -" — the live REG-00061 row.
    expect(isPendingGuest(seat({ name: '- -', email: 'x@y.com' }))).toBe(true);
  });

  it('recognises a seat with no way to reach it', () => {
    expect(isPendingGuest(seat({ name: 'Real Name', email: '' }))).toBe(true);
    expect(isPendingGuest(seat({ name: 'Real Name', email: 'guest-abc@placeholder.invalid' }))).toBe(true);
    expect(isPendingGuest(seat({ name: 'Real Name', email: 'x@y.com', answers: { tscs_companion_status: 'pending' } }))).toBe(true);
  });

  it('keeps a named, reachable delegate on the roster even while their claim is open', () => {
    // A sponsor listing their staff by name and address has given us real
    // people. Dropping them is the regression the unified dashboard undid.
    expect(isPendingGuest(seat({ guestType: 'staff-pending', name: 'Tomás Rivera', email: 'tomas@x.com' }))).toBe(false);
    expect(isPendingGuest(seat({ guestType: 'pending-claim', name: 'Dana Osei', email: 'dana@x.com' }))).toBe(false);
  });

  it('never hides a booking own row', () => {
    expect(isPendingGuest({ isPrimary: true, name: '', email: '' })).toBe(false);
  });
});

describe('guestContactStatus', () => {
  it('trusts the recorded source when the ingest wrote one', () => {
    expect(guestContactStatus({ email: 'a@x.com', answers: { tscs_email_source: 'inherited' } })).toBe('shared-inbox');
    expect(guestContactStatus({ email: 'a@x.com', answers: { tscs_email_source: 'own' } })).toBe('reachable');
  });

  it('falls back to comparing addresses, so rows written before the marker still read true', () => {
    expect(guestContactStatus({ email: 'Buyer@X.com' }, 'buyer@x.com')).toBe('shared-inbox');
    expect(guestContactStatus({ email: 'guest@x.com' }, 'buyer@x.com')).toBe('reachable');
  });

  it('reports an unclaimed seat as pending, never as reachable', () => {
    expect(guestContactStatus({
      isPrimary: false, primaryAttendeeId: 'p', guestType: 'pending-claim',
      name: 'Buyer - Guest (pending)', email: 'guest-a@placeholder.invalid',
    })).toBe('pending');
  });

  it('treats a booking own row with no address as sharing nothing it can be blamed for', () => {
    // Only companions can inherit an inbox; a primary with no address is a
    // data problem for the booking itself, not a shared-inbox case.
    expect(guestContactStatus({ isPrimary: true, email: '' })).toBe('shared-inbox');
  });

  it('does not mistake an ordinary attendee with no purchaser for a shared inbox', () => {
    expect(guestContactStatus({ email: 'solo@x.com' })).toBe('reachable');
  });
});

describe('isEmailableRecipient', () => {
  it('excludes unclaimed seats and rows with no address', () => {
    expect(isEmailableRecipient({ name: 'Dana', email: 'dana@x.com' })).toBe(true);
    expect(isEmailableRecipient({
      isPrimary: false, primaryAttendeeId: 'p',
      name: 'Buyer - Guest (pending)', email: 'guest-a@placeholder.invalid',
    })).toBe(false);
    expect(isEmailableRecipient({ name: 'Dana', email: '   ' })).toBe(false);
  });
});

describe('summarizeRegistrations — unclaimed seats', () => {
  it('counts them separately so the roster can hide them without losing them', () => {
    const rows = [
      { id: 'p', isPrimary: true, name: 'Buyer', email: 'buyer@x.com' },
      { id: 'g', isPrimary: false, primaryAttendeeId: 'p', guestType: 'pending-claim', name: 'Buyer - Guest (pending)', email: 'guest-g@placeholder.invalid' },
      { id: 'r', isPrimary: false, primaryAttendeeId: 'p', name: 'Real Guest', email: 'real@x.com' },
    ];
    const s = summarizeRegistrations(rows, buildRegistrationIndex(rows));
    expect(s.total).toBe(3);
    expect(s.pendingGuests).toBe(1);
  });

  it('ignores test rows, like every other number on the cards', () => {
    const rows = [{ id: 'g', isTest: true, isPrimary: false, primaryAttendeeId: 'p', guestType: 'pending-claim', name: 'x', email: 'guest-g@placeholder.invalid' }];
    expect(summarizeRegistrations(rows, buildRegistrationIndex(rows)).pendingGuests).toBe(0);
  });
});
