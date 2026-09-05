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

// ── Removing a seat ─────────────────────────────────────────────────────────
//
// Two things must never be destroyed by a roster tidy-up, and the rule lived in
// two places: the dashboard hid the Remove button for a checked-in seat, while
// storageService threw for that plus a seat with a free guest hanging off it.
// Two encodings of one rule is how a UI ends up offering a button the server
// then refuses.

export interface SeatRemovalFacts {
  /** Set once the person has arrived and been scanned in. */
  checkedInAt?: string | null;
  /** Free guests sourced from this seat. Unknown to the browser; pass 0 there. */
  bogoClaimCount?: number;
}

/**
 * Why this seat cannot be removed, phrased for the sponsor, or null if it can.
 *
 * The caller decides what to do with it: the roster hides its Remove button,
 * `removeStaffMember` throws it. Both consult the same rule, so the button is
 * never offered for something the write would reject.
 */
export function seatRemovalBlocker(facts: SeatRemovalFacts): string | null {
  if (facts.checkedInAt) {
    // Deleting the row would erase the only record that they arrived.
    return 'This person has already checked in — ask the organisers to remove them.';
  }
  if ((facts.bogoClaimCount ?? 0) > 0) {
    // bogo_source_attendee_id is ON DELETE SET NULL, so the free guest would
    // survive as a live ticket with no record of who it came from.
    return 'This person has a free guest attached — ask the organisers to remove them.';
  }
  return null;
}

// ── Seat quota ──────────────────────────────────────────────────────────────
//
// A sponsor tier and an exhibitor booth both grant the same two things: some
// number of Hall-Only seats and some number of Full Congress seats. The
// registration form enforces those limits when the booking is made — but the
// portal's roster editor did not, so a gold sponsor (8 + 4) could quietly
// switch every one of their people to Full Congress and walk in with twelve.
// The rules live here so both paths agree on them.

import { getSponsorTier } from '../config/formTemplates/sponsorTiers';
import { getBoothType } from '../config/formTemplates/boothTypes';

export type StaffCategory = 'hall_only' | 'full_access';

export interface CategoryQuota {
  hall_only: number;
  full_access: number;
}

export interface SeatUsage {
  quota: CategoryQuota;
  used: CategoryQuota;
  remaining: CategoryQuota;
}

export const CATEGORY_LABELS: Record<StaffCategory, string> = {
  hall_only: 'Hall-Only',
  full_access: 'Full Congress',
};

/**
 * What to call a seat type in front of a person.
 *
 * `CATEGORY_LABELS` covers the two real categories; this adds the fallback for
 * a seat carrying no category at all, which the roster editor and the staff
 * emails both need. It exists because those two disagreed: the dashboard mailed
 * a colleague "Full-Access" while the portal, the tickets page, the roster and
 * the registration form all called the same pass "Full Congress". Anything that
 * names a seat type to a human should call this rather than inline a ternary.
 */
export function staffCategoryLabel(category: string | null | undefined): string {
  if (category === 'hall_only' || category === 'full_access') return CATEGORY_LABELS[category];
  return 'Sponsor Seat';
}

/** What the booking entitles this org to. Zero for anything unrecognised. */
export function quotaForPrimary(primary: Attendee | null | undefined): CategoryQuota {
  if (!primary) return { hall_only: 0, full_access: 0 };
  if (primary.exhibitorBoothType) {
    const booth = getBoothType(primary.exhibitorBoothType);
    return booth
      ? { hall_only: booth.hallOnlyQuota, full_access: booth.fullAccessQuota }
      : { hall_only: 0, full_access: 0 };
  }
  if (primary.sponsorTier) {
    const tier = getSponsorTier(primary.sponsorTier as any);
    return tier
      ? { hall_only: tier.hallOnlyQuota, full_access: tier.fullCongressQuota }
      : { hall_only: 0, full_access: 0 };
  }
  return { hall_only: 0, full_access: 0 };
}

/**
 * Seats consumed against the allotment.
 *
 * Paid extras are excluded deliberately: those were bought on top of the tier
 * at a per-head price, so counting them would penalise the sponsor who paid
 * for more people and block edits they are entitled to make.
 */
export function seatUsage(
  primary: Attendee | null | undefined,
  staff: readonly Attendee[],
  opts: { excludeId?: string } = {},
): SeatUsage {
  const quota = quotaForPrimary(primary);
  const used: CategoryQuota = { hall_only: 0, full_access: 0 };
  for (const s of staff) {
    if (opts.excludeId && s.id === opts.excludeId) continue;
    if (s.isPaidExtra === true) continue;
    const category = (s.answers as any)?.staffCategory as StaffCategory | undefined;
    if (category === 'hall_only' || category === 'full_access') used[category]++;
  }
  return {
    quota,
    used,
    remaining: {
      hall_only: quota.hall_only - used.hall_only,
      full_access: quota.full_access - used.full_access,
    },
  };
}

export interface QuotaCheck {
  ok: boolean;
  /** Present when ok is false — safe to show to the sponsor as-is. */
  reason?: string;
}

/**
 * May this staff member be moved to (or created in) `next`?
 *
 * The seat being edited is excluded from the count before testing, so
 * re-saving someone without changing their category can never fail — a rule
 * that rejects the current state would make a name typo unfixable.
 *
 * When the answer is no, the sponsor has to free a seat first. That is the
 * intended workflow, not a dead end: removing someone is offered right beside
 * this, and the message says so.
 */
export function canAssignCategory(
  primary: Attendee | null | undefined,
  staff: readonly Attendee[],
  staffId: string,
  next: StaffCategory,
): QuotaCheck {
  const { quota, used } = seatUsage(primary, staff, { excludeId: staffId });
  const limit = quota[next];
  if (used[next] + 1 <= limit) return { ok: true };
  const label = CATEGORY_LABELS[next];
  if (limit === 0) {
    return { ok: false, reason: `Your booking does not include any ${label} seats.` };
  }
  return {
    ok: false,
    reason:
      `All ${limit} ${label} seat${limit === 1 ? '' : 's'} on your booking are taken. ` +
      `Remove someone from ${label} first, then assign it here.`,
  };
}
