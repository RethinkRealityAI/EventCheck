// utils/registrationKind.ts
//
// ONE answer to "what kind of registration is this row?" for the admin
// dashboard.
//
// Before this existed the main dashboard only knew two shapes — attendee and
// guest — and treated a sponsor's or exhibitor's delegation as neither: the
// staff rows were filtered out of the Live tab entirely (they read as
// "placeholder ghost rows"), the org booking rendered as an ordinary attendee
// with no hint it was a company, and the only place a sponsor's people were
// visible together was the separate Sponsors page. An admin asking "where are
// the Pfizer registrants?" had to know which of three screens to open.
//
// The model is deliberately small:
//
//   org       — the booking row a sponsor / exhibitor submitted. Not a badge
//               for a human (the portal already excludes it from personal
//               tickets for that reason). Sub-typed sponsor / exhibitor /
//               sponsor+exhibitor by what was bought.
//   delegate  — a person registered THROUGH an org booking: sponsor staff,
//               exhibitor booth staff, legacy sponsor "Guest Ticket #N" seats,
//               paid extra booth staff. They hold (or will hold) a real pass.
//   attendee  — everyone else: individual registrants, their group guests,
//               BOGO free guests, speakers, donated-seat claims.
//
// Pure + data-only so it is unit-tested and can be shared by the list, the
// stats cards, the export and the tab gates without any of them drifting.

export type OrgKind = 'sponsor' | 'exhibitor' | 'sponsor-exhibitor';
export type RegistrationKind = 'attendee' | 'delegate' | OrgKind;

/** The subset of an attendee row (plus its form) the resolver looks at. */
export interface KindInput {
  id: string;
  formId?: string | null;
  isPrimary?: boolean | null;
  primaryAttendeeId?: string | null;
  sponsorTier?: string | null;
  exhibitorBoothType?: string | null;
  ticketType?: string | null;
  guestType?: string | null;
  companyInfo?: { orgName?: string | null; contactName?: string | null } | null;
  name?: string | null;
  email?: string | null;
  answers?: Record<string, unknown> | null;
  isTest?: boolean | null;
}

export type FormTypeLookup = (formId: string | null | undefined) => string | undefined;

/** guest_type values that mark a row as a member of an org's delegation. */
export const DELEGATE_GUEST_TYPES: ReadonlySet<string> = new Set([
  'staff-pending',
  'staff-claimed',
  'exhibitor-staff-pending',
  'exhibitor-staff-claimed',
]);

/** guest_type values meaning "seat reserved, person has not completed their own details". */
const PENDING_GUEST_TYPES: ReadonlySet<string> = new Set([
  'staff-pending',
  'exhibitor-staff-pending',
  'pending-claim',
]);

function isPrimaryRow(a: KindInput): boolean {
  return a.isPrimary !== false && !a.primaryAttendeeId;
}

/**
 * The org sub-type of a PRIMARY row, or null when the row is an ordinary
 * attendee. Looks at what was actually bought first (tier / booth) and only
 * then at the form type, so a combined-form primary that picked a booth reads
 * as an exhibitor and one that picked a tier reads as a sponsor — matching how
 * the Exhibitors tab and the Sponsors page already split them.
 */
export function resolveOrgKind(a: KindInput, formTypeOf?: FormTypeLookup): OrgKind | null {
  if (!isPrimaryRow(a)) return null;
  const hasTier = !!a.sponsorTier;
  const hasBooth = !!a.exhibitorBoothType;
  if (hasTier && hasBooth) return 'sponsor-exhibitor';
  if (hasTier) return 'sponsor';
  if (hasBooth) return 'exhibitor';
  if (a.ticketType === 'Exhibitor') return 'exhibitor';
  const formType = formTypeOf?.(a.formId);
  if (formType === 'sponsor') return 'sponsor';
  if (formType === 'exhibitor') return 'exhibitor';
  if (formType === 'sponsor_exhibitor') return 'sponsor-exhibitor';
  return null;
}

export interface RegistrationIndex {
  /** Every row's resolved kind, keyed by attendee id. */
  kindById: Map<string, RegistrationKind>;
  /** Org booking rows, keyed by id. */
  orgById: Map<string, { kind: OrgKind; orgName: string; row: KindInput }>;
  /** For each delegate id → the org booking it belongs to (when it exists). */
  orgIdByDelegateId: Map<string, string>;
}

/**
 * Resolve every row in one pass. Delegates are recognised two ways so neither
 * a deleted org nor a legacy row without a guest_type can hide someone:
 *   - their `primaryAttendeeId` points at an org booking, or
 *   - they carry one of the staff guest_type values.
 */
export function buildRegistrationIndex(rows: readonly KindInput[], formTypeOf?: FormTypeLookup): RegistrationIndex {
  const kindById = new Map<string, RegistrationKind>();
  const orgById = new Map<string, { kind: OrgKind; orgName: string; row: KindInput }>();
  const orgIdByDelegateId = new Map<string, string>();

  for (const a of rows) {
    const orgKind = resolveOrgKind(a, formTypeOf);
    if (orgKind) {
      orgById.set(a.id, { kind: orgKind, orgName: orgDisplayName(a), row: a });
      kindById.set(a.id, orgKind);
    }
  }

  for (const a of rows) {
    if (kindById.has(a.id)) continue;
    const parentOrg = a.primaryAttendeeId ? orgById.get(a.primaryAttendeeId) : undefined;
    if (parentOrg) {
      kindById.set(a.id, 'delegate');
      orgIdByDelegateId.set(a.id, a.primaryAttendeeId!);
      continue;
    }
    if (a.guestType && DELEGATE_GUEST_TYPES.has(a.guestType)) {
      kindById.set(a.id, 'delegate');
      continue;
    }
    kindById.set(a.id, 'attendee');
  }

  return { kindById, orgById, orgIdByDelegateId };
}

export function resolveRegistrationKind(index: RegistrationIndex, id: string): RegistrationKind {
  return index.kindById.get(id) ?? 'attendee';
}

export function isOrgKind(kind: RegistrationKind): kind is OrgKind {
  return kind === 'sponsor' || kind === 'exhibitor' || kind === 'sponsor-exhibitor';
}

/** The organisation name for an org booking row (falls back to the row name). */
export function orgDisplayName(a: Pick<KindInput, 'companyInfo' | 'name'>): string {
  const org = a.companyInfo?.orgName?.trim();
  return org || (a.name ?? '').trim() || 'Organization';
}

/** For a delegate: the org they belong to, or null when the booking is gone. */
export function delegateOrgName(index: RegistrationIndex, delegateId: string): string | null {
  const orgId = index.orgIdByDelegateId.get(delegateId);
  if (!orgId) return null;
  return index.orgById.get(orgId)?.orgName ?? null;
}

export type DelegateStatus = 'pending' | 'registered';

/** Whether a delegate has completed their own details (registered) or the
 *  seat is still waiting on them (pending). Rows an org filled in fully at
 *  booking time carry no guest_type and are registered. */
export function delegateStatus(a: Pick<KindInput, 'guestType' | 'name'>): DelegateStatus {
  if (a.guestType && PENDING_GUEST_TYPES.has(a.guestType)) return 'pending';
  // Legacy sponsor seats predate guest_type stamping; the placeholder name is
  // the only signal (same heuristic the Sponsors page uses).
  if (!a.guestType && (a.name ?? '').includes('Guest Ticket #')) return 'pending';
  return 'registered';
}

// ── Can we reach this person? ─────────────────────────────────────────────
//
// A companion row answers to two different questions, and conflating them is
// what put an attendee literally named "- -" in the live roster:
//
//   IS THERE A PERSON HERE?  No name means the seat is booked and unclaimed.
//                            Nothing to show on the roster, nothing to send.
//   CAN WE WRITE TO THEM?    A named companion whose mail routes through the
//                            purchaser is still a real registrant with a real
//                            badge — they just are not an independent inbox,
//                            so a mass send must not address them.

export type GuestContactStatus = 'pending' | 'shared-inbox' | 'reachable';

export type GuestContactInput = Pick<
  KindInput, 'guestType' | 'name' | 'email' | 'answers' | 'isPrimary' | 'primaryAttendeeId'
>;

/**
 * `.invalid` is reserved by RFC 2606 and resolves to nothing, which is exactly
 * why unclaimed seats carry an address in it. Mirrors the server-side rule in
 * supabase/functions/_shared/companionIdentity.ts.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return /@placeholder\.invalid$/i.test((email ?? '').trim());
}

/**
 * Placeholder names the platform issues for a seat nobody has filled in:
 * ManualTicketTool's "…- Guest Ticket #3", the BOGO flow's "…- Free Guest
 * (pending)", the TSCS ingest's "…- Guest (pending)", and the sponsor staff
 * form's "…— Staff slot #3".
 */
const PLACEHOLDER_NAME_RE = /Guest Ticket #|Guest \(pending\)|Staff slot #/i;

/**
 * A booked seat with nobody reachable on it.
 *
 * Deliberately NOT "guest_type says pending". A sponsor who has listed their
 * staff by name and address has given us real people who merely have not
 * completed their own details — they belong on the roster, and dropping them
 * is the exact regression the unified dashboard was built to undo. What does
 * not belong is a row with no name, or no address, or both: there is nobody to
 * show and nobody to send to.
 */
export function isPendingGuest(a: GuestContactInput): boolean {
  // A booking's own row always belongs on the roster, however thin it looks.
  if (a.isPrimary !== false && !a.primaryAttendeeId) return false;
  if (a.answers?.tscs_companion_status === 'pending') return true;
  if (isPlaceholderEmail(a.email)) return true;
  if (!(a.email ?? '').trim()) return true;
  const name = (a.name ?? '').trim();
  if (!name || PLACEHOLDER_NAME_RE.test(name)) return true;
  // The same two-letter floor the ingest applies, so "- -" reads the same on
  // both sides of the wire.
  return name.toLowerCase().replace(/[^a-z\u00C0-\u024F]/g, '').length < 2;
}

/**
 * `purchaserEmail` is what makes this work without a backfill: rows written
 * before the ingest recorded `tscs_email_source` carry no marker at all, and
 * comparing against the booking's own address still tells the truth.
 */
export function guestContactStatus(a: GuestContactInput, purchaserEmail?: string | null): GuestContactStatus {
  if (isPendingGuest(a)) return 'pending';
  const declared = a.answers?.tscs_email_source;
  if (declared === 'inherited') return 'shared-inbox';
  if (declared === 'own') return 'reachable';
  const email = (a.email ?? '').trim().toLowerCase();
  if (!email) return 'shared-inbox';
  const buyer = (purchaserEmail ?? '').trim().toLowerCase();
  if (buyer && email === buyer) return 'shared-inbox';
  return 'reachable';
}

/** Never put one of these in a recipient list. */
export function isEmailableRecipient(a: GuestContactInput): boolean {
  return !isPendingGuest(a) && !!(a.email ?? '').trim();
}

// ── Presentation metadata ─────────────────────────────────────────────────

export interface KindMeta {
  id: RegistrationKind;
  label: string;
  shortLabel: string;
  description: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}

export const REGISTRATION_KIND_META: Record<RegistrationKind, KindMeta> = {
  attendee: {
    id: 'attendee',
    label: 'Attendee',
    shortLabel: 'ATTENDEE',
    description: 'Individual registrant, group guest or free guest',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-700',
    pillBorder: 'border-slate-200',
  },
  delegate: {
    id: 'delegate',
    label: 'Delegate',
    shortLabel: 'DELEGATE',
    description: 'Registered through a sponsor or exhibitor booking',
    pillBg: 'bg-sky-100',
    pillText: 'text-sky-800',
    pillBorder: 'border-sky-200',
  },
  sponsor: {
    id: 'sponsor',
    label: 'Sponsor',
    shortLabel: 'SPONSOR',
    description: 'Sponsorship booking (organization)',
    pillBg: 'bg-rose-100',
    pillText: 'text-rose-800',
    pillBorder: 'border-rose-200',
  },
  exhibitor: {
    id: 'exhibitor',
    label: 'Exhibitor',
    shortLabel: 'EXHIBITOR',
    description: 'Exhibitor booth booking (organization)',
    pillBg: 'bg-teal-100',
    pillText: 'text-teal-800',
    pillBorder: 'border-teal-200',
  },
  'sponsor-exhibitor': {
    id: 'sponsor-exhibitor',
    label: 'Sponsor + Exhibitor',
    shortLabel: 'SPONSOR + EXHIBITOR',
    description: 'Sponsorship and booth on one booking (organization)',
    pillBg: 'bg-fuchsia-100',
    pillText: 'text-fuchsia-800',
    pillBorder: 'border-fuchsia-200',
  },
};

// ── Quick filter ──────────────────────────────────────────────────────────

export const REGISTRATION_KIND_FILTERS = ['all', 'attendees', 'sponsors', 'exhibitors', 'delegates', 'orgs'] as const;
export type RegistrationKindFilter = typeof REGISTRATION_KIND_FILTERS[number];

export const REGISTRATION_KIND_FILTER_LABELS: Record<RegistrationKindFilter, string> = {
  all: 'All types',
  attendees: 'Attendees only',
  sponsors: 'Sponsors',
  exhibitors: 'Exhibitors',
  delegates: 'Sponsor / exhibitor delegates',
  orgs: 'Organizations (any)',
};

export function matchesRegistrationKindFilter(kind: RegistrationKind, filter: RegistrationKindFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'attendees': return kind === 'attendee';
    case 'sponsors': return kind === 'sponsor' || kind === 'sponsor-exhibitor';
    case 'exhibitors': return kind === 'exhibitor' || kind === 'sponsor-exhibitor';
    case 'delegates': return kind === 'delegate';
    case 'orgs': return isOrgKind(kind);
  }
}

// ── Roll-ups ──────────────────────────────────────────────────────────────

export interface RegistrationBreakdown {
  total: number;
  attendees: number;
  delegates: number;
  delegatesRegistered: number;
  delegatesPending: number;
  orgs: number;
  sponsors: number;
  exhibitors: number;
  /** Booked seats with nobody named yet — hidden from the roster by default. */
  pendingGuests: number;
}

/** Counts for the stats cards. Test rows are excluded — the same rule the
 *  cards already apply to every other number. */
export function summarizeRegistrations(rows: readonly KindInput[], index: RegistrationIndex): RegistrationBreakdown {
  const out: RegistrationBreakdown = {
    total: 0, attendees: 0, delegates: 0, delegatesRegistered: 0, delegatesPending: 0,
    orgs: 0, sponsors: 0, exhibitors: 0, pendingGuests: 0,
  };
  for (const a of rows) {
    if (a.isTest) continue;
    out.total += 1;
    if (isPendingGuest(a)) out.pendingGuests += 1;
    const kind = resolveRegistrationKind(index, a.id);
    if (kind === 'attendee') out.attendees += 1;
    else if (kind === 'delegate') {
      out.delegates += 1;
      if (delegateStatus(a) === 'pending') out.delegatesPending += 1;
      else out.delegatesRegistered += 1;
    } else {
      out.orgs += 1;
      if (kind === 'sponsor' || kind === 'sponsor-exhibitor') out.sponsors += 1;
      if (kind === 'exhibitor' || kind === 'sponsor-exhibitor') out.exhibitors += 1;
    }
  }
  return out;
}
