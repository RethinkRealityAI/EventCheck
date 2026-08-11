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

import type { PromoCode, PricingCategory } from '../types';

export const DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE = 'Speaker Registration Discount Applied';

export const PROMO_USAGE_LIMIT_MESSAGE =
  'This promo code has reached its maximum use. Please reach out to admin@inheritedblooddisorders.world if you think this is a mistake.';

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

/** Speaker / promo-required tiers show "Free" instead of dollar amounts in UI. */
export function shouldMaskCategoryPricing(
  category: Pick<PricingCategory, 'name' | 'requiresPromoCode'> | null | undefined,
): boolean {
  return categoryRequiresPromoCode(category);
}

/** Speaker-style categories require a promo before checkout completes. */
export function categoryRequiresPromoCode(
  category: Pick<PricingCategory, 'name' | 'requiresPromoCode'> | null | undefined,
): boolean {
  if (!category) return false;
  if (category.requiresPromoCode === true) return true;
  return isSpeakerRegistrationCategory(category.name);
}

/** Legacy/global promos omit allowedCategoryIds (undefined). An explicit
 *  array — even empty — means category-scoped. */
export function isPromoGlobal(promo: PromoCode): boolean {
  return promo.allowedCategoryIds === undefined;
}

/** Whether `promo` may be applied to the selected pricing category. */
export function isPromoAllowedForCategory(
  promo: PromoCode,
  categoryId: string | null | undefined,
): boolean {
  if (isPromoGlobal(promo)) return true;
  if (!categoryId) return false;
  return promo.allowedCategoryIds!.includes(categoryId);
}

/** Configured max uses for this promo + category, or null when unlimited. */
export function getPromoUsageLimit(
  promo: PromoCode,
  categoryId: string,
): number | null {
  const limit = promo.usageLimits?.[categoryId];
  if (typeof limit !== 'number' || limit <= 0) return null;
  return limit;
}

/** True when usage count has reached or exceeded the configured limit. */
export function isPromoUsageLimitReached(
  promo: PromoCode,
  categoryId: string,
  currentUsageCount: number,
): boolean {
  const limit = getPromoUsageLimit(promo, categoryId);
  if (limit == null) return false;
  return currentUsageCount >= limit;
}

/** Global max uses for this promo across ALL categories, or null when unlimited. */
export function getPromoTotalUsageLimit(promo: PromoCode): number | null {
  const limit = promo.totalUsageLimit;
  if (typeof limit !== 'number' || limit <= 0) return null;
  return limit;
}

/** True when total cross-category usage has reached or exceeded the global limit. */
export function isPromoTotalUsageLimitReached(
  promo: PromoCode,
  currentTotalCount: number,
): boolean {
  const limit = getPromoTotalUsageLimit(promo);
  if (limit == null) return false;
  return currentTotalCount >= limit;
}

/** Categories that should appear in the usage-limit editor for a promo. */
export function promoUsageLimitCategories(
  promo: PromoCode,
  templateCategories: Pick<PricingCategory, 'id' | 'name'>[],
): Pick<PricingCategory, 'id' | 'name'>[] {
  if (isPromoGlobal(promo)) return templateCategories;
  const allowed = new Set(promo.allowedCategoryIds ?? []);
  return templateCategories.filter(c => allowed.has(c.id));
}

/** True when any of the given category ids require a promo at checkout. */
export function anyCategoryRequiresPromoCode(
  template: { categories: Pick<PricingCategory, 'id' | 'name' | 'requiresPromoCode'>[] } | null | undefined,
  categoryIds: Array<string | null | undefined>,
): boolean {
  if (!template) return false;
  const byId = new Map(template.categories.map(c => [c.id, c]));
  return categoryIds
    .filter((id): id is string => !!id)
    .some(id => categoryRequiresPromoCode(byId.get(id)));
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

// ─────────────────────────────────────────────────────────────────────────────
// Group registrations vs category-scoped promos
//
// A promo can be applied while it's valid (the buyer's own category is covered)
// and then silently go stale when a GROUP MEMBER is given a category the code
// doesn't cover. The clearing effect only watched the buyer's category, so the
// running total kept showing the discount, the buyer reached PayPal expecting
// $0, and the server rejected the submission — surfacing as an opaque
// "database error" after they'd already committed to paying.
//
// These helpers make the mismatch explicit BEFORE payment, and say what the
// code actually covers so the buyer knows what to change.
// ─────────────────────────────────────────────────────────────────────────────

export interface PromoCoverageResult {
  /** True when the promo covers every selected category. */
  ok: boolean;
  /** Selected category ids the promo does NOT cover (deduped, order preserved). */
  uncoveredIds: string[];
}

/**
 * Check a promo against EVERY selected category (buyer + group members).
 * Blank/missing ids are ignored — those are "not chosen yet", not violations.
 */
export function checkPromoCoversCategories(
  promo: PromoCode | null | undefined,
  categoryIds: Array<string | null | undefined>,
): PromoCoverageResult {
  if (!promo) return { ok: true, uncoveredIds: [] };
  const seen = new Set<string>();
  const uncoveredIds: string[] = [];
  for (const raw of categoryIds) {
    const id = (raw ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!isPromoAllowedForCategory(promo, id)) uncoveredIds.push(id);
  }
  return { ok: uncoveredIds.length === 0, uncoveredIds };
}

/**
 * Buyer-facing explanation of a coverage failure. Names the offending
 * categories AND what the code does cover, so the fix is obvious rather than
 * "this code is invalid, good luck".
 */
export function promoCoverageMessage(
  promo: PromoCode,
  uncoveredIds: string[],
  categoryNameById: (id: string) => string,
): string {
  const bad = uncoveredIds.map(categoryNameById).filter(Boolean);
  const allowed = isPromoGlobal(promo)
    ? []
    : (promo.allowedCategoryIds ?? []).map(categoryNameById).filter(Boolean);
  const badList = bad.length ? bad.join(', ') : 'one or more selected categories';
  const base = `Promo code ${promo.code} doesn't apply to ${badList}.`;
  const allowedPart = allowed.length
    ? ` It can only be used for: ${allowed.join(', ')}.`
    : '';
  return `${base}${allowedPart} Change those registrations to a covered category, or remove the promo code to pay the standard rate.`;
}

/**
 * Does this promo have enough remaining uses for `quantity` registrations?
 *
 * A group of N consumes N uses. Checking only "limit reached" (count >= limit)
 * passes a group of 5 when 3 uses remain, then fails at insert time — after
 * payment intent. Returns null when the promo is unlimited.
 */
export function promoUsesRemaining(
  promo: PromoCode,
  currentTotalCount: number,
): number | null {
  const limit = getPromoTotalUsageLimit(promo);
  if (limit == null) return null;
  return Math.max(0, limit - Math.max(0, currentTotalCount));
}

/** Buyer-facing message when a group is larger than the promo's remaining uses. */
export function promoQuantityMessage(promo: PromoCode, remaining: number, requested: number): string {
  if (remaining <= 0) return PROMO_USAGE_LIMIT_MESSAGE;
  return `Promo code ${promo.code} has ${remaining} use${remaining === 1 ? '' : 's'} left, `
    + `but you're registering ${requested} people. Reduce the group to ${remaining} `
    + `or fewer to use this code, or remove it to pay the standard rate.`;
}
