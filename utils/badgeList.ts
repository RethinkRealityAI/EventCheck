// The badge-printing list: one row per person who needs a printed badge, in
// the exact column layout GANSID's registration vendor (MICE IDEAS) asked for
// (Registration_List_Format_GANSID_26_Hyderabad.xlsx), plus what the Badge
// Printing tab needs to tell "not printed" from "printed" from "changed since
// printed".
//
// Decisions agreed with the organisers (2026-10-14):
//   * Who: every named registrant — delegates, speakers, free guests,
//     exhibitor / sponsor staff and DMHO delegates. Not org booking rows
//     (a company is not a person) and not unclaimed seats (no name to print).
//   * Reg. ID: permanent GSD_IND_### / GSD_INT_### (attendees.reg_code,
//     assigned server-side by assign_reg_codes). The region comes from the
//     person's country, else their booking's, else IND (flagged as unknown)
//     — the congress is in Hyderabad.
//   * Meals: Lunch and Dinner are "Yes" for each congress day the person
//     attends (Days Attending); no days on file means all three days.
//   * Hall-only exhibitor staff get no conference kit or certificate.
//   * One category column (2026-10-15): the vendor's sheet had both "Badge
//     Category" and "Reg. Category", which disagreed. Only *Reg. Category is
//     kept, filled from the person's ticket. Full Access / Hall Only is an
//     exhibitor & sponsor staff distinction, so it only appears for them
//     ("Exhibitor – Full Access", "Sponsor – Hall Only", …).
//
// Pure + data-only so it is unit-tested.

import type { Attendee, Form } from '../types';
import { getCountryName } from './countries';
import { daysAttendingOf } from './daysAttending';
import { attendeeTitleOf, nameWithTitle } from './attendeeTitle';
import { isPendingGuest, orgDisplayName, type RegistrationIndex } from './registrationKind';

/** Congress days, in order. Lunch on all three, dinner on the first two. */
export const CONGRESS_DAYS = ['2026-10-23', '2026-10-24', '2026-10-25'] as const;

export const BADGE_COLUMNS = [
  'Sr. no.', '*Reg. ID', '*Lunch 1', 'Dinner 1*', '*Lunch 2', '*Dinner 2', '*Lunch 3', '*Conf. Kit',
  '*Certificate', '*Name', '*City/Country', '*Mobile', '*Email Id', 'Reg. Status',
  '*Reg. Category', 'Designation/ Affiliation', 'Institute', 'Medical Council State',
  'Medical Council Reg Number', 'State/Country', 'Confirmation email', 'Remark',
] as const;

export type BadgeRegion = 'IND' | 'INT';

/** The printed fields — everything on the sheet except Sr. no. */
export interface BadgeFields {
  regId: string;
  lunch1: string; dinner1: string; lunch2: string; dinner2: string; lunch3: string;
  kit: string;
  certificate: string;
  name: string;
  cityCountry: string;
  mobile: string;
  email: string;
  regStatus: string;
  regCategory: string;
  designation: string;
  institute: string;
  councilState: string;
  councilRegNo: string;
  stateCountry: string;
  confirmationEmail: string;
  remark: string;
}

export interface BadgeRow {
  attendee: Attendee;
  fields: BadgeFields;
  region: BadgeRegion;
  /** True when no country was on file and the region was inferred. */
  countryUnknown: boolean;
  /** Stable hash of what gets printed — differs ⇒ the badge needs reprinting. */
  fingerprint: string;
}

export interface BadgeContext {
  index: RegistrationIndex;
  attendeesById: Map<string, Attendee>;
  formById: Map<string, Form>;
}

const yes = (b: boolean) => (b ? 'Yes' : 'No');

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : (typeof v === 'number' ? String(v) : '');
}

/** Person, not company; has a name; real. */
export function isBadgeEligible(a: Attendee, ctx: BadgeContext): boolean {
  if (a.isTest) return false;
  if (ctx.index.orgById.has(a.id)) return false;
  if (isPendingGuest(a)) return false;
  return true;
}

function countryCodeOf(a: Attendee, form: Form | undefined): string {
  const answers = (a.answers ?? {}) as Record<string, unknown>;
  const direct = str(answers._guest_country) || str(answers.f_country);
  if (direct) return direct.toUpperCase();
  const field = form?.fields?.find(f => f.type === 'country');
  return field ? str(answers[field.id]).toUpperCase() : '';
}

function mobileOf(a: Attendee): string {
  const answers = (a.answers ?? {}) as Record<string, unknown>;
  return str(answers.f_phone) || str(answers.f_whatsapp);
}

export function badgeRegionOf(a: Attendee, ctx: BadgeContext): { region: BadgeRegion; countryUnknown: boolean; countryCode: string } {
  let code = countryCodeOf(a, ctx.formById.get(a.formId));
  if (!code && a.primaryAttendeeId) {
    const parent = ctx.attendeesById.get(a.primaryAttendeeId);
    if (parent) code = countryCodeOf(parent, ctx.formById.get(parent.formId));
  }
  if (code) return { region: code === 'IN' ? 'IND' : 'INT', countryUnknown: false, countryCode: code };
  // No country anywhere: the congress is in Hyderabad and nearly every
  // registrant without one is local exhibitor staff, so default to IND and
  // flag it on the tab for a human to check.
  return { region: 'IND', countryUnknown: true, countryCode: '' };
}

function staffCategoryOf(a: Attendee): string {
  const answers = (a.answers ?? {}) as Record<string, unknown>;
  return str(answers.staffCategory) || str(answers.exhibitor_staff_category);
}

function isHallOnly(a: Attendee): boolean {
  return staffCategoryOf(a) === 'hall_only' || /hall[\s-]*only/i.test(a.ticketType ?? '');
}

// Ticket types that name how a ticket was issued, not who the person is.
const ISSUED_AS_INVITE = /^(issued \(free\)|invited \(free\)|manual entry)$/i;
const ISSUED_AS_GUEST = /^registration \(free guest\)$/i;
const ISSUED_AS_COMPANION = /^registration( \(free add-on\))?$/i;
// Generic admission, and "Full Congress" bought outside an exhibitor / sponsor
// booking (e.g. TSCS supporters): Full Access is only a staff-package label.
const GENERIC_ADMISSION = /^(general admission|paid admission|registration|full congress|full access)$/i;

/** "Physicians/Researchers — Early Bird" → "Physicians/Researchers". */
function baseTicketName(t: string): string {
  return t.split(' — ')[0].trim();
}

/**
 * The single category printed on the badge (*Reg. Category).
 *   Speakers → Speaker; DMHO delegates → DMHO Delegate;
 *   exhibitor / sponsor staff → "<Exhibitor|Sponsor> – <Full Access|Hall Only>" from their package;
 *   a buy-one-get-one companion → the category of the delegate who bought it;
 *   invited / free-guest tickets → Invited Delegate / Guest; generic admission → Attendee;
 *   otherwise the ticket bought.
 */
export function regCategoryOf(a: Attendee, ctx: BadgeContext): string {
  if (a.guestType === 'speaker' || a.attendeeCategory === 'speaker') return 'Speaker';
  if (a.attendeeCategory === 'dmho') return 'DMHO Delegate';
  const orgId = ctx.index.orgIdByDelegateId.get(a.id);
  const org = orgId ? ctx.index.orgById.get(orgId) : undefined;
  if (org) return `${org.kind === 'sponsor' ? 'Sponsor' : 'Exhibitor'} – ${isHallOnly(a) ? 'Hall Only' : 'Full Access'}`;

  const ticket = baseTicketName(a.ticketType ?? '');
  if (/^supporting staff$/i.test(ticket)) return 'Crew';
  if (ISSUED_AS_COMPANION.test(ticket) && a.primaryAttendeeId) {
    const parent = ctx.attendeesById.get(a.primaryAttendeeId);
    const parentTicket = parent ? baseTicketName(parent.ticketType ?? '') : '';
    if (parent && parentTicket && !ISSUED_AS_COMPANION.test(parentTicket)) return regCategoryOf(parent, ctx);
  }
  if (ISSUED_AS_INVITE.test(ticket)) return 'Invited Delegate';
  if (ISSUED_AS_GUEST.test(ticket)) return 'Guest';
  if (!ticket || GENERIC_ADMISSION.test(ticket)) return 'Attendee';
  return ticket;
}

function regStatusOf(a: Attendee): string {
  if (a.paymentStatus === 'paid') return 'Paid';
  if (a.paymentStatus === 'pending') return 'Pending';
  return 'Complimentary';
}

/** Small, stable, non-cryptographic hash (djb2) — enough to spot a change. */
export function fingerprintOf(fields: BadgeFields): string {
  const { confirmationEmail: _ignored, ...printed } = fields;
  const s = JSON.stringify(printed);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function buildBadgeRow(a: Attendee, ctx: BadgeContext): BadgeRow {
  const answers = (a.answers ?? {}) as Record<string, unknown>;
  const form = ctx.formById.get(a.formId);
  const { region, countryUnknown, countryCode } = badgeRegionOf(a, ctx);
  const countryName = countryCode ? getCountryName(countryCode) : '';

  const days = daysAttendingOf(a);
  const attends = (d: string) => days.length === 0 || days.includes(d);
  const [d1, d2, d3] = CONGRESS_DAYS;

  const hallOnly = isHallOnly(a);
  const orgId = ctx.index.orgIdByDelegateId.get(a.id);
  const org = orgId ? ctx.index.orgById.get(orgId) : undefined;
  const city = str(answers.f_city);

  const fields: BadgeFields = {
    regId: a.regCode ?? '',
    lunch1: yes(attends(d1)),
    dinner1: yes(attends(d1)),
    lunch2: yes(attends(d2)),
    dinner2: yes(attends(d2)),
    lunch3: yes(attends(d3)),
    kit: yes(!hallOnly),
    certificate: yes(!hallOnly),
    name: nameWithTitle(a.name ?? '', attendeeTitleOf(a, form)),
    cityCountry: [city, countryName].filter(Boolean).join(', '),
    mobile: mobileOf(a),
    email: (a.email ?? '').trim(),
    regStatus: regStatusOf(a),
    regCategory: regCategoryOf(a, ctx),
    designation: str(answers.f_role),
    institute: str(answers.f_org) || (org ? orgDisplayName(org.row) : ''),
    councilState: 'NA',
    councilRegNo: 'NA',
    stateCountry: countryName,
    confirmationEmail: yes(!!a.lastTicketEmailAt),
    remark: '',
  };
  return { attendee: a, fields, region, countryUnknown, fingerprint: fingerprintOf(fields) };
}

/** The sheet row, in BADGE_COLUMNS order. */
export function badgeSheetRow(srNo: number, f: BadgeFields): (string | number)[] {
  return [
    srNo, f.regId, f.lunch1, f.dinner1, f.lunch2, f.dinner2, f.lunch3, f.kit, f.certificate,
    f.name, f.cityCountry, f.mobile, f.email, f.regStatus, f.regCategory,
    f.designation, f.institute, f.councilState, f.councilRegNo, f.stateCountry, f.confirmationEmail, f.remark,
  ];
}

// ── Print status ─────────────────────────────────────────────────────────────

export interface PrintRecord {
  exportId: number;
  createdAt: string;
  fingerprint: string;
}

export type PrintStatus = 'new' | 'changed' | 'printed';

export const PRINT_STATUS_LABELS: Record<PrintStatus, string> = {
  new: 'Not printed',
  changed: 'Changed since printed',
  printed: 'Printed',
};

/** Latest print of this person decides: never → new; same fingerprint → printed. */
export function printStatusOf(row: BadgeRow, latest: PrintRecord | undefined): PrintStatus {
  if (!latest) return 'new';
  return latest.fingerprint === row.fingerprint ? 'printed' : 'changed';
}
