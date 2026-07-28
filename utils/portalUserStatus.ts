// utils/portalUserStatus.ts
//
// ONE definition of a portal user's registration status, shared by the Signups
// tab's filter buttons, its counts, its status badge, and the email modal's
// template picker.
//
// Those four used to each re-derive it inline from `hasPaidTicket`, which is
// how a registrant could sit in "Not started" while a "Registered" badge was
// perfectly renderable from the same data — and how reminder emails went to
// people who had already registered.
//
// Two corrections are baked in here:
//
//   1. A registration is complete whether it was PAID or FREE. Free rows are
//      real registrations — invited contacts, BOGO guests, 100%-off speaker
//      promos, comped admissions — and they were previously invisible, so
//      every one of those people appeared as "Not started".
//   2. `pending` is NOT complete (payment was started and never finished) but
//      it isn't "not started" either. Those users belong in In progress, with
//      or without a saved draft.
//
// No imports: keeps this unit-testable without the Supabase client.

/** Attendee payment states that mean "this person completed a registration". */
export const COMPLETED_PAYMENT_STATUSES = ['paid', 'free'] as const;

/** States that mean "started but not finished" — payment began, no ticket. */
export const PENDING_PAYMENT_STATUSES = ['pending'] as const;

export type PortalUserStatus = 'registered' | 'in_progress' | 'not_started';

export function isCompletedPaymentStatus(status: unknown): boolean {
  return typeof status === 'string'
    && (COMPLETED_PAYMENT_STATUSES as readonly string[]).includes(status);
}

export function isPendingPaymentStatus(status: unknown): boolean {
  return typeof status === 'string'
    && (PENDING_PAYMENT_STATUSES as readonly string[]).includes(status);
}

/** The fields of a portal user that determine their status. */
export interface PortalUserStatusInput {
  /** Count of completed (paid OR free) attendee rows attached to this user. */
  ticketCount: number;
  /** True when an attendee row exists with payment_status = 'pending'. */
  hasPendingPayment?: boolean;
  /** A saved in-progress registration draft, if any. */
  draft?: unknown | null;
}

export function classifyPortalUser(u: PortalUserStatusInput): PortalUserStatus {
  if ((u.ticketCount ?? 0) > 0) return 'registered';
  if (u.draft || u.hasPendingPayment) return 'in_progress';
  return 'not_started';
}

/** Filter keys used by the Signups tab, mapped to the statuses they include. */
export type PortalUserFilterKey = 'all' | 'not_started' | 'in_progress' | 'has_ticket';

export function matchesPortalUserFilter(
  u: PortalUserStatusInput,
  filter: PortalUserFilterKey,
): boolean {
  if (filter === 'all') return true;
  const status = classifyPortalUser(u);
  if (filter === 'has_ticket') return status === 'registered';
  if (filter === 'in_progress') return status === 'in_progress';
  return status === 'not_started';
}
