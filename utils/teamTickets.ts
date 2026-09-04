// Shared rules for "an organisation's team", used by the portal dashboard's
// TeamTable and the My Tickets team section.
//
// These three predicates decide who counts as a primary contact, which staff
// seats are real tickets, and what a seat is called. They were previously
// inlined in each component, which is how the dashboard and the tickets page
// could disagree about the same roster.

import type { Attendee } from '../types';

/**
 * True when this row is an organisation's booking — the sponsor or exhibitor
 * record whose holder is responsible for the whole delegation.
 *
 * Both flags matter: sponsors carry `sponsorTier`, exhibitors carry
 * `exhibitorBoothType`, and an org can be one without the other. `isPrimary`
 * is required as well, because a staff row can sit under a sponsor booking
 * without being the booking itself.
 */
export function isTeamPrimary(a: Attendee): boolean {
  return a.isPrimary === true && !!(a.sponsorTier || a.exhibitorBoothType);
}

/** Every org booking in a set of the user's own rows. */
export function selectTeamPrimaries(rows: readonly Attendee[]): Attendee[] {
  return rows.filter(isTeamPrimary);
}

/**
 * A seat that exists but whose holder never filled in their own details, so
 * there is no ticket to hand them yet — only an invitation to re-send.
 */
export function isPendingStaff(a: Attendee): boolean {
  return a.guestType === 'staff-pending' || a.guestType === 'exhibitor-staff-pending';
}

/**
 * What a staff seat grants. Falls back to the row's ticket type rather than a
 * dash: a seat created outside the roster flow (an admin registering a
 * delegation by hand) has no `staffCategory`, and showing "—" next to a
 * perfectly valid pass reads as a broken record.
 */
export function staffPassLabel(a: Attendee): string {
  const category = (a.answers as any)?.staffCategory;
  if (category === 'hall_only') return 'Hall-Only';
  if (category === 'full_access') return 'Full Congress';
  return a.ticketType || '—';
}
