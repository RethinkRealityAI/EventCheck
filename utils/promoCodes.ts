// utils/promoCodes.ts
//
// Pure helpers for promo-code resolution + discount application. Used by
// PublicRegistration (client preview) and mirrored in verify-payment
// (authoritative server validation — server NEVER trusts the client's
// pre-discounted total).
//
// Promo codes live in `form.settings.promoCodes` (per-form) for dynamic
// pricing. The legacy `ticketField.ticketConfig.promoCodes` array on
// static-ticket forms is still supported on the static branch and is
// unaffected by this helper.

import type { PromoCode } from '../types';

export const DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE = 'Speaker Registration Discount Applied';

/** Message shown after a promo is applied in the registration UI. */
export function promoAppliedMessage(promo: PromoCode): string {
  const custom = promo.appliedMessage?.trim();
  if (custom) return custom;
  if (promo.appliesGuestType === 'speaker') return DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE;
  return `Promo code applied: ${promo.code}`;
}

/** Case-insensitive lookup. Returns undefined if not found or disabled. */
export function findPromoCode(
  codes: PromoCode[] | undefined | null,
  rawCode: string | null | undefined,
): PromoCode | undefined {
  if (!codes || !rawCode) return undefined;
  const needle = String(rawCode).trim().toLowerCase();
  if (!needle) return undefined;
  return codes.find(
    p => p.code.toLowerCase() === needle && p.enabled !== false,
  );
}

/** Apply promo to a base + add-ons split. When `appliesTo` is
 *  `registration_only`, the discount applies to `baseCents` only; add-ons
 *  are added after. Otherwise the discount applies to base + add-ons. */
export function applyPromoToPricing(
  baseCents: number,
  addonsCents: number,
  promo: PromoCode | undefined,
): number {
  if (!promo) return baseCents + addonsCents;
  if (promo.appliesTo === 'registration_only') {
    return applyPromoDiscount(baseCents, promo) + addonsCents;
  }
  return applyPromoDiscount(baseCents + addonsCents, promo);
}

/** Returns the discounted total in minor units (cents). The discount is
 *  computed against `subtotal` only — it never goes negative. */
export function applyPromoDiscount(subtotalCents: number, promo: PromoCode | undefined): number {
  if (!promo) return subtotalCents;
  if (subtotalCents <= 0) return 0;
  if (promo.type === 'percent') {
    const pct = Math.max(0, Math.min(100, promo.value));
    const discount = Math.round((subtotalCents * pct) / 100);
    return Math.max(0, subtotalCents - discount);
  }
  // 'fixed' — promo.value is in minor units (cents) per the existing
  // verify-payment convention.
  return Math.max(0, subtotalCents - Math.max(0, promo.value));
}

/** True when applying `promo` to `subtotalCents` zeroes it out. */
export function isFreeAfterPromo(subtotalCents: number, promo: PromoCode | undefined): boolean {
  return applyPromoDiscount(subtotalCents, promo) === 0 && !!promo;
}

/** True when the pricing category label is a Speaker tier (e.g. "Speaker"). */
export function isSpeakerRegistrationCategory(categoryName: string | undefined | null): boolean {
  return !!categoryName && /\bspeaker\b/i.test(categoryName);
}

/** Any enabled promo codes configured on this form (dynamic or static ticket). */
export function formHasEnabledPromoCodes(
  settingsPromos: PromoCode[] | undefined | null,
  staticPromos: PromoCode[] | undefined | null,
): boolean {
  const has = (codes: PromoCode[] | undefined | null) =>
    !!codes?.some(p => p.enabled !== false && String(p.code || '').trim());
  return has(settingsPromos) || has(staticPromos);
}

/** UI-friendly description: "100% off" / "$5 off" / etc. */
export function describePromo(promo: PromoCode, currency = 'USD'): string {
  if (promo.type === 'percent') return `${promo.value}% off`;
  const amount = (promo.value / 100).toFixed(2);
  return `${amount} ${currency} off`;
}
