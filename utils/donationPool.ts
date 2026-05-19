import type { Attendee } from '../types';

export interface DonationPool {
  /** Sum of `donatedSeats` across primary donor rows. */
  donated: number;
  /** Count of attendee rows that consumed a donated seat (`isDonatedSeatClaim`). */
  claimed: number;
  /** `max(0, donated - claimed)` — the number of seats still available for an
   *  admin to assign via the AddAttendee / ManualTicket flows. */
  available: number;
}

/**
 * Pure helper that computes the live donation-pool snapshot from the
 * dashboard's attendee list. Used by the Donated Seats stat card and by the
 * "issue a donated seat" affordances in AddAttendeeModal + ManualTicketTool
 * so the available count stays consistent across surfaces.
 *
 * Test rows are excluded — donated seats donated on a test row shouldn't
 * inflate the live pool, and a test claim shouldn't decrement it either.
 */
export function computeDonationPool(attendees: Attendee[]): DonationPool {
  const real = attendees.filter(a => a.isTest !== true);
  const donated = real.reduce((sum, a) => sum + (Number(a.donatedSeats) || 0), 0);
  const claimed = real.filter(a => a.isDonatedSeatClaim === true).length;
  const available = Math.max(0, donated - claimed);
  return { donated, claimed, available };
}
