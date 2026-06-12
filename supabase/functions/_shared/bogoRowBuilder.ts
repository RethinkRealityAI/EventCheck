// @ts-nocheck
// Shared helper for constructing BOGO free-attendee insert rows. Used by
// both `verify-payment` (at-checkout BOGO claims) and `bogo-send` (portal
// post-purchase actions) so the row shape stays identical across surfaces.
//
// Important: the FREE row inherits the PAYER's tier+bracket — the price
// ceiling is always computed at the payer's tier+bracket, never at the
// guest's. The free row's pricing_category_id is the guest's chosen
// category (or null for claim_link mode, where the guest picks at claim
// time).

export interface BuildBogoRowArgs {
  paid: {
    id: string;
    form_id: string;
    form_title?: string | null;
    email: string;
    pricing_template_id?: string | null;
    pricing_tier?: string | null;
    pricing_bracket?: string | null;
  };
  formId: string;
  invoiceId: string;
  mode: 'inline' | 'claim_link';
  guestName?: string;
  guestEmail?: string;
  guestCategoryId?: string | null;
}

export function buildBogoRow(args: BuildBogoRowArgs) {
  const { paid, formId, invoiceId, mode, guestName, guestEmail, guestCategoryId } = args;
  const id = crypto.randomUUID();
  const isInline = mode === 'inline';

  const fallbackName = `${paid.email ? paid.email.split('@')[0] : 'Guest'} - Free Guest (pending)`;

  return {
    id,
    form_id: formId,
    form_title: paid.form_title ?? null,
    name: isInline ? (guestName || fallbackName) : fallbackName,
    email: isInline ? (guestEmail || paid.email) : paid.email,
    ticket_type: 'Registration (Free Guest)',
    registered_at: new Date().toISOString(),
    payment_status: 'free',
    payment_amount: '0',
    payment_method: 'bogo',
    invoice_id: invoiceId,
    // Scanner contract: qr_payload MUST be exactly JSON.stringify({ id }).
    // The scanner only reads parsed.id; any extra fields (formId/invoiceId/etc.)
    // risk breaking check-in if the scanner is ever hardened to validate shape.
    // invoiceId/formId are already persisted in their own columns above.
    qr_payload: JSON.stringify({ id }),
    is_primary: true,
    primary_attendee_id: null,
    guest_type: isInline ? 'adult' : 'pending-claim',
    is_test: false,
    is_paid_extra: false,
    is_donated_seat_claim: false,
    is_bogo_claim: true,
    bogo_source_attendee_id: paid.id,
    pricing_template_id: paid.pricing_template_id ?? null,
    pricing_tier: paid.pricing_tier ?? null,
    pricing_bracket: paid.pricing_bracket ?? null,
    pricing_category_id: isInline ? (guestCategoryId ?? null) : null,
  };
}

export const BOGO_ADMIN_CONTACT = 'admin@inheritedblooddisorders.world';

/** Server-side BOGO eligibility check — mirrors utils/bogo.ts on the client
 *  but works against DB row shape (snake_case). Returns null when eligible,
 *  or an error code string when not. */
export function checkBogoSourceEligibility(
  paid: any,
  form: any,
): string | null {
  if (!form?.settings?.bogoEnabled) return 'BOGO_NOT_ENABLED';
  if (paid.is_test === true) return 'BOGO_INELIGIBLE_SOURCE';
  if (paid.is_bogo_claim === true) return 'BOGO_INELIGIBLE_SOURCE';
  if (paid.is_donated_seat_claim === true) return 'BOGO_INELIGIBLE_SOURCE';
  if (paid.payment_status === 'free') return 'BOGO_INELIGIBLE_SOURCE';
  const blockedGuestTypes = [
    'exhibitor-staff-pending',
    'exhibitor-staff-claimed',
    'staff-pending',
    'staff-claimed',
    'speaker',
  ];
  if (paid.guest_type && blockedGuestTypes.includes(paid.guest_type)) {
    return 'BOGO_INELIGIBLE_SOURCE';
  }
  return null;
}

/** Looks up a price in the pricing template — server-safe (no client types). */
export function priceAt(
  template: any,
  categoryId: string,
  tierId: string,
  bracketId: string,
): number | null {
  const category = template?.categories?.find((c: any) => c.id === categoryId);
  if (!category) return null;
  const fee = category.prices?.[tierId]?.[bracketId];
  return typeof fee === 'number' ? fee : null;
}

/** True when `candidateCategoryId`'s price at the payer's tier+bracket
 *  is <= the payer's category price (also looked up at payer's tier+bracket). */
export function isCategoryAtOrBelowCeiling(
  template: any,
  payerCategoryId: string,
  payerTierId: string,
  payerBracketId: string,
  candidateCategoryId: string,
): boolean {
  const ceiling = priceAt(template, payerCategoryId, payerTierId, payerBracketId);
  const candidate = priceAt(template, candidateCategoryId, payerTierId, payerBracketId);
  if (ceiling === null || candidate === null) return false;
  return candidate <= ceiling;
}
