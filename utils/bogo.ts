// utils/bogo.ts
//
// Pure helpers for the Buy-One-Get-One-Free (BOGO) feature. All logic that
// decides eligibility, slot state, and the price-ceiling rule lives here so
// it's easy to test and reuse across the form, server, portal, and admin
// surfaces.
//
// See docs/superpowers/specs/2026-05-26-bogo-gansid-design.md for the full
// rule set.

import type {
  Attendee,
  Form,
  PricingTemplate,
  PricingTier,
  DateBracket,
} from '../types';

/** Email address printed on every BOGO-related surface (forms, portal, emails)
 *  as the operator's escape hatch for changes the app can't make on its own
 *  (e.g. editing a committed recipient's email). */
export const BOGO_ADMIN_CONTACT = 'admin@inheritedblooddisorders.world';

/** Four-state BOGO slot status, computed per paid attendee. */
export type BogoSlotState =
  | { kind: 'ineligible' }
  | { kind: 'available' }
  | { kind: 'inline-sent';        free: Attendee; uncommitted: boolean }
  | { kind: 'pending-claim-sent'; free: Attendee; uncommitted: boolean }
  | { kind: 'claimed';            free: Attendee };

/** Returns true when the paid attendee row can participate in BOGO at all.
 *  Independent of whether a free guest has already been issued. */
export function isBogoEligibleSource(paid: Attendee, form: Form): boolean {
  if (!form.settings?.bogoEnabled) return false;
  if (paid.isTest === true) return false;
  if (paid.isBogoClaim === true) return false;          // no chaining
  if (paid.isDonatedSeatClaim === true) return false;   // free claims don't grant
  if (paid.paymentStatus === 'free') return false;      // promo-free / waived → no BOGO
  // Sponsor/exhibitor staff have specific guest_type values — exclude.
  if (paid.guestType === 'exhibitor-staff-pending') return false;
  if (paid.guestType === 'exhibitor-staff-claimed') return false;
  if (paid.guestType === 'staff-pending') return false;
  if (paid.guestType === 'staff-claimed') return false;
  if (paid.guestType === 'speaker') return false;       // free speakers don't unlock BOGO
  return true;
}

/** Returns true when the free attendee row is still "uncommitted" — meaning
 *  the payer can still edit name + email + category. After commit, only the
 *  name is editable (typo fix). */
export function isBogoUncommitted(free: Attendee): boolean {
  if (free.userId) return false;             // recipient linked a profile
  if (free.checkedInAt) return false;        // already attended
  if (free.guestType === 'claimed') return false;
  return true;
}

/** Computes the slot state for a single paid attendee row given the full
 *  attendee list (needed to check whether anyone references this row's id).
 *  Dismissed rows still count as "slot used" — they don't return BOGO
 *  inventory to the payer. */
export function getBogoSlotState(
  paid: Attendee,
  allAttendees: Attendee[],
  form: Form,
): BogoSlotState {
  if (!isBogoEligibleSource(paid, form)) return { kind: 'ineligible' };

  const free = allAttendees.find(
    a => a.isBogoClaim === true && a.bogoSourceAttendeeId === paid.id,
  );
  if (!free) return { kind: 'available' };

  if (free.guestType === 'claimed') {
    return { kind: 'claimed', free };
  }

  const uncommitted = isBogoUncommitted(free);

  if (free.guestType === 'pending-claim') {
    return { kind: 'pending-claim-sent', free, uncommitted };
  }

  return { kind: 'inline-sent', free, uncommitted };
}

/** Number of BOGO slots the given user still has unused across their
 *  attendee rows. Drives the "X free tickets to send" headline on the
 *  portal dashboard tile and the My Tickets header. */
export function countAvailableBogoSlots(
  userAttendees: Attendee[],
  allAttendees: Attendee[],
  formsById: Record<string, Form>,
): number {
  let count = 0;
  for (const paid of userAttendees) {
    const form = formsById[paid.formId];
    if (!form) continue;
    const state = getBogoSlotState(paid, allAttendees, form);
    if (state.kind === 'available') count += 1;
  }
  return count;
}

/** Resolves the price (in minor units) of a given category at the supplied
 *  tier+bracket. Returns null when the category is missing or the matrix
 *  has no entry for that tier+bracket pairing. */
export function priceAt(
  template: PricingTemplate,
  categoryId: string,
  tierId: string,
  bracketId: string,
): number | null {
  const category = template.categories.find(c => c.id === categoryId);
  if (!category) return null;
  const fee = category.prices?.[tierId]?.[bracketId];
  return typeof fee === 'number' ? fee : null;
}

/** Looks up the payer's price ceiling. Returns null when any input is
 *  missing or the matrix entry is absent. */
export function computeBogoPriceCeiling(
  template: PricingTemplate,
  paid: Pick<Attendee, 'pricingCategoryId' | 'pricingTier' | 'pricingBracket'> & {
    pricingCategoryId?: string | null;
    pricingTier?: string | null;
    pricingBracket?: string | null;
  },
): number | null {
  if (!paid.pricingCategoryId || !paid.pricingTier || !paid.pricingBracket) return null;
  return priceAt(template, paid.pricingCategoryId, paid.pricingTier, paid.pricingBracket);
}

/** Filters the pricing template's categories down to those whose price at
 *  the payer's tier+bracket is <= the payer's price. Used to populate the
 *  free-guest category dropdown on both checkout and portal send forms. */
export function getEligibleBogoCategories(
  template: PricingTemplate,
  paid: Pick<Attendee, 'pricingCategoryId' | 'pricingTier' | 'pricingBracket'>,
): Array<{ id: string; name: string; price: number }> {
  const ceiling = computeBogoPriceCeiling(template, paid);
  if (ceiling === null) return [];
  if (!paid.pricingTier || !paid.pricingBracket) return [];
  const tierId = paid.pricingTier;
  const bracketId = paid.pricingBracket;
  return template.categories
    .map(c => {
      const price = priceAt(template, c.id, tierId, bracketId);
      return price !== null && price <= ceiling
        ? { id: c.id, name: c.name, price }
        : null;
    })
    .filter((c): c is { id: string; name: string; price: number } => c !== null);
}

/** True when `candidateCategoryId` is a valid free-guest category for
 *  `paid` — i.e. its price at the payer's tier+bracket is <= the payer's
 *  price. Used by server-side validation in verify-payment + bogo-send. */
export function isCategoryEligibleForBogo(
  template: PricingTemplate,
  paid: Pick<Attendee, 'pricingCategoryId' | 'pricingTier' | 'pricingBracket'>,
  candidateCategoryId: string,
): boolean {
  const eligible = getEligibleBogoCategories(template, paid);
  return eligible.some(c => c.id === candidateCategoryId);
}

/** Convenience: pricing inputs from a PricingTier + DateBracket pair. Used
 *  by the checkout flow where we already have the resolved tier/bracket
 *  objects and want to compute the ceiling for a category the buyer is
 *  selecting before any row is stamped. */
export function priceCeilingFromSelection(
  template: PricingTemplate,
  categoryId: string,
  tier: PricingTier,
  bracket: DateBracket,
): number | null {
  return priceAt(template, categoryId, tier.id, bracket.id);
}
