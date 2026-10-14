import { describe, expect, it } from 'vitest';
import type { Attendee, Form } from '../types';
import { buildRegistrationIndex } from '../utils/registrationKind';
import {
  BADGE_COLUMNS, badgeSheetRow, buildBadgeRow, fingerprintOf, isBadgeEligible, printStatusOf,
} from '../utils/badgeList';

const base = (o: Partial<Attendee>): Attendee => ({
  id: 'x', formId: 'congress', formTitle: '', name: 'Someone', email: 's@example.test', ticketType: 'Physicians/Researchers',
  registeredAt: '2026-10-01T10:00:00Z', checkedInAt: null, qrPayload: '', paymentStatus: 'paid', answers: {},
  isTest: false, isPrimary: true, ...o,
} as Attendee);

const forms: Form[] = [
  { id: 'congress', title: 'Congress', formType: 'event', fields: [], settings: {} } as unknown as Form,
  { id: 'exhibitors', title: 'Exhibitors', formType: 'sponsor_exhibitor', fields: [], settings: {} } as unknown as Form,
];

function ctxFor(rows: Attendee[]) {
  const ft = new Map(forms.map(f => [f.id, f.formType] as const));
  return {
    index: buildRegistrationIndex(rows, id => (id ? ft.get(id) : undefined)),
    attendeesById: new Map(rows.map(a => [a.id, a] as const)),
    formById: new Map(forms.map(f => [f.id, f] as const)),
  };
}

describe('badge list', () => {
  const delegate = base({
    id: 'd1', name: 'Jane Doe', regCode: 'GSD_IND_001',
    answers: { f_title: 'Dr.', f_country: 'IN', f_city: 'Hyderabad', f_phone: '+919800000000', f_role: 'Consultant', f_org: 'NIMS', f_days: ['October 23, 2026', 'October 25, 2026'] },
    lastTicketEmailAt: '2026-10-02T00:00:00Z',
  });
  const org = base({ id: 'o1', formId: 'exhibitors', name: 'Acme', ticketType: 'Exhibitor', exhibitorBoothType: 'booth_3x3', companyInfo: { orgName: 'Acme Pharma' } as any });
  const hallStaff = base({ id: 's1', formId: 'exhibitors', name: 'Sam Staff', isPrimary: false, primaryAttendeeId: 'o1', ticketType: 'Hall Only', guestType: 'staff-claimed' as any, answers: { staffCategory: 'hall_only' } });
  const unclaimed = base({ id: 'u1', name: 'Jane Doe - Guest Ticket #2', isPrimary: false, primaryAttendeeId: 'd1', email: 'guest-u1@placeholder.invalid' });
  const intl = base({ id: 'i1', name: 'Ama Owusu', answers: { f_country: 'GH' } });
  const all = [delegate, org, hallStaff, unclaimed, intl];
  const ctx = ctxFor(all);

  it('prints people, not company bookings or unclaimed seats', () => {
    expect(all.filter(a => isBadgeEligible(a, ctx)).map(a => a.id)).toEqual(['d1', 's1', 'i1']);
  });

  it('fills the vendor template from the registration', () => {
    const r = buildBadgeRow(delegate, ctx);
    expect(r.fields).toMatchObject({
      regId: 'GSD_IND_001', name: 'Dr. Jane Doe', badgeCategory: 'Full Access',
      lunch1: 'Yes', dinner1: 'Yes', lunch2: 'No', dinner2: 'No', lunch3: 'Yes',
      kit: 'Yes', certificate: 'Yes', cityCountry: 'Hyderabad, India', mobile: '+919800000000',
      regStatus: 'Paid', designation: 'Consultant', institute: 'NIMS', councilState: 'NA', confirmationEmail: 'Yes',
    });
    expect(r.region).toBe('IND');
    expect(badgeSheetRow(1, r.fields)).toHaveLength(BADGE_COLUMNS.length);
  });

  it('gives hall-only exhibitor staff their org, an Exhibitor badge and no kit / certificate', () => {
    const r = buildBadgeRow(hallStaff, ctx);
    expect(r.fields).toMatchObject({ badgeCategory: 'Exhibitor (Hall Only)', kit: 'No', certificate: 'No', institute: 'Acme Pharma' });
    expect(r.fields.lunch1 + r.fields.lunch3).toBe('YesYes');
    expect(r.countryUnknown).toBe(true);
    expect(r.region).toBe('IND');
  });

  it('puts non-Indian registrants in the international series', () => {
    expect(buildBadgeRow(intl, ctx).region).toBe('INT');
  });

  it('labels speakers, DMHOs and complimentary registrations', () => {
    const sp = buildBadgeRow(base({ id: 'sp', guestType: 'speaker' as any, paymentStatus: 'free' }), ctx);
    expect(sp.fields.badgeCategory).toBe('Speaker');
    expect(sp.fields.regStatus).toBe('Complimentary');
    expect(buildBadgeRow(base({ id: 'dm', attendeeCategory: 'dmho' as any }), ctx).fields.badgeCategory).toBe('DMHO');
  });
});

describe('print status', () => {
  const ctx = ctxFor([base({ id: 'a' })]);
  const row = buildBadgeRow(base({ id: 'a', regCode: 'GSD_IND_009' }), ctx);

  it('is new until printed, printed while unchanged, changed once a printed field moves', () => {
    expect(printStatusOf(row, undefined)).toBe('new');
    expect(printStatusOf(row, { exportId: 1, createdAt: '', fingerprint: row.fingerprint })).toBe('printed');
    const renamed = buildBadgeRow(base({ id: 'a', regCode: 'GSD_IND_009', name: 'Other Name' }), ctx);
    expect(printStatusOf(renamed, { exportId: 1, createdAt: '', fingerprint: row.fingerprint })).toBe('changed');
  });

  it('ignores the confirmation-email column, which changes without the badge changing', () => {
    expect(fingerprintOf({ ...row.fields, confirmationEmail: 'Yes' })).toBe(fingerprintOf({ ...row.fields, confirmationEmail: 'No' }));
  });
});
