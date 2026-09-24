// Who may create which account from a /#/account?token=… link.
//
// WHY THIS EXISTS
// A companion (free add-on, or a paid seat in a group booking) is often
// registered under the purchaser's email — TSCS India's form lets a buyer type
// their own address for everyone. That companion holds a real ticket but can
// never have a portal account of their own: one email is one account, and that
// account is the purchaser's. Emailing them "sign up with this address" would
// hand them the purchaser's login.
//
// The account link fixes that. It is signed for ONE ticket (kind 'account',
// _shared/registrationToken.ts) and lets whoever holds it:
//   * create the account at the ticket's own address, when the ticket has one
//     of its own and no account yet; or
//   * move the ticket to a new address (their own), after which they sign up
//     there. This is the shared-email case.
//
// What it must never do:
//   * touch a ticket already linked to an account at its own address — that
//     person signs in instead;
//   * mint a pre-verified account for an address nobody has proven they own.
//     Only the address we emailed the link to is proven. An address typed on
//     the page goes through the normal confirm-your-email sign-up;
//   * move a ticket onto the purchaser's address, which would share it again.
//
// Pure: no I/O, so the rules are unit-tested (tests/accountClaim.test.ts) and
// the edge function only does what these functions decide.

import { isPlaceholderEmail } from './companionIdentity.ts';

export interface ClaimRow {
  email: string | null;
  user_id: string | null;
  guest_type: string | null;
  primary_attendee_id: string | null;
  answers?: Record<string, unknown> | null;
}

/** Seats with no named person yet go through the `?ref=` claim form, not this. */
const PENDING_SEAT_TYPES = new Set(['pending-claim', 'staff-pending', 'exhibitor-staff-pending']);

/** Recorded on the row when a ticket is moved to an address typed on the page. */
export const MOVED_TO_KEY = 'account_claim_moved_to';

export type ClaimState =
  /** No account of its own yet. `sharedEmail`: registered under the purchaser's address. */
  | { kind: 'open'; sharedEmail: boolean }
  /** Already belongs to an account at its own address — sign in instead. */
  | { kind: 'linked' }
  | { kind: 'unavailable'; reason: 'pending-seat' };

const norm = (e: string | null | undefined) => String(e ?? '').trim().toLowerCase();

// Deliberately modest: the auth service is the real validator. This only
// stops the obvious mistakes before a ticket is moved to an unusable address —
// including the doubled TLD (…@gmail.com.com) TSCS has delivered before.
export function isPlausibleEmail(email: string): boolean {
  const e = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)) return false;
  if (/\.(com|org|net|in)\.(com|org|net)$/.test(e)) return false;
  return true;
}

export function claimStateOf(row: ClaimRow, purchaserEmail: string | null | undefined): ClaimState {
  if (isPlaceholderEmail(row.email) || (row.guest_type && PENDING_SEAT_TYPES.has(row.guest_type))) {
    return { kind: 'unavailable', reason: 'pending-seat' };
  }
  const sharedEmail = !!row.primary_attendee_id
    && !!norm(purchaserEmail)
    && norm(purchaserEmail) === norm(row.email);
  // A shared-address companion's user_id is the PURCHASER's account (the
  // link-by-email triggers put it there). It is not theirs, so it does not
  // count as "already has an account".
  if (sharedEmail) return { kind: 'open', sharedEmail: true };
  if (row.user_id) return { kind: 'linked' };
  return { kind: 'open', sharedEmail: false };
}

export type ClaimPlan =
  /** Create a pre-verified account at the ticket's own (emailed, so proven) address. */
  | { action: 'create-verified' }
  /** The address is not proven: the client signs up normally and confirms by email. */
  | { action: 'signup-unverified' }
  /** Point the ticket at `email`, then the client signs up there. */
  | { action: 'move'; email: string }
  | { action: 'reject'; reason: ClaimRejectReason };

export type ClaimRejectReason =
  | 'invalid-email'
  | 'already-linked'
  | 'unavailable'
  | 'needs-own-email'
  | 'purchaser-email';

export function planClaim(
  state: ClaimState,
  row: ClaimRow,
  requestedEmail: string,
  purchaserEmail: string | null | undefined,
): ClaimPlan {
  if (state.kind === 'unavailable') return { action: 'reject', reason: 'unavailable' };
  if (state.kind === 'linked') return { action: 'reject', reason: 'already-linked' };

  const email = norm(requestedEmail);
  if (!isPlausibleEmail(email)) return { action: 'reject', reason: 'invalid-email' };

  if (email === norm(row.email)) {
    if (state.sharedEmail) return { action: 'reject', reason: 'needs-own-email' };
    // Proven only if this is the address we emailed the link to. An address
    // this page moved the ticket to earlier was typed, not proven.
    const movedTo = norm(row.answers?.[MOVED_TO_KEY] as string | undefined);
    return movedTo && movedTo === email ? { action: 'signup-unverified' } : { action: 'create-verified' };
  }

  if (row.primary_attendee_id && norm(purchaserEmail) && email === norm(purchaserEmail)) {
    return { action: 'reject', reason: 'purchaser-email' };
  }
  return { action: 'move', email };
}

/** Registrant-facing copy for each refusal. */
export const CLAIM_REJECT_MESSAGES: Record<ClaimRejectReason, string> = {
  'invalid-email': 'Please check the email address — it does not look complete.',
  'already-linked': 'This ticket already belongs to an account. Sign in with that email to see it.',
  'unavailable': 'This ticket is not ready for an account yet. Please contact the congress team.',
  'needs-own-email': 'This ticket was registered under the email of the person who booked it. Please enter your own email address.',
  'purchaser-email': 'That is the email of the person who booked this ticket. Please use your own email address.',
};
