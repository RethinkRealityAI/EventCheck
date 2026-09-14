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
