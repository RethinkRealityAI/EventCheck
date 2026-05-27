import { resolveBracket, resolveTier, computeTotal, sumAddonCents } from './pricing';
import type { PricingTemplate } from '../types';

export interface GroupMemberPricingInput {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
}

export interface GroupMemberPricingResolved {
  cents: number;
  tierId: string;
  bracketId: string;
  categoryId: string;
}

export type GroupPricingResult =
  | { ok: true; total: number; perPerson: GroupMemberPricingResolved[]; bracketId: string }
  | { ok: false; error: string };

export function computeGroupTotal(
  template: PricingTemplate,
  members: GroupMemberPricingInput[],
  now: Date,
): GroupPricingResult {
  const bracket = resolveBracket(template, now);
  if (!bracket) return { ok: false, error: 'No active pricing bracket' };

  const perPerson: GroupMemberPricingResolved[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const tier = resolveTier(template, m.countryCode);
    if (!tier) return { ok: false, error: `Member ${i + 1}: no tier resolvable` };
    const cents = computeTotal(template, m.categoryId, tier, bracket, m.addonIds);
    if (cents == null) return { ok: false, error: `Member ${i + 1}: category '${m.categoryId}' price not configured` };
    perPerson.push({ cents, tierId: tier.id, bracketId: bracket.id, categoryId: m.categoryId });
  }

  return {
    ok: true,
    total: perPerson.reduce((sum, p) => sum + p.cents, 0),
    perPerson,
    bracketId: bracket.id,
  };
}

/** Category fees vs add-ons for group promo `registration_only` scope. */
export function computeGroupBaseAndAddons(
  template: PricingTemplate,
  members: GroupMemberPricingInput[],
  now: Date,
): { ok: true; baseCents: number; addonsCents: number } | { ok: false; error: string } {
  const bracket = resolveBracket(template, now);
  if (!bracket) return { ok: false, error: 'No active pricing bracket' };

  let baseCents = 0;
  let addonsCents = 0;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const tier = resolveTier(template, m.countryCode);
    if (!tier) return { ok: false, error: `Member ${i + 1}: no tier resolvable` };
    const category = template.categories.find(c => c.id === m.categoryId);
    if (!category) return { ok: false, error: `Member ${i + 1}: unknown category` };
    const fee = category.prices?.[tier.id]?.[bracket.id];
    if (typeof fee !== 'number') {
      return { ok: false, error: `Member ${i + 1}: category price not configured` };
    }
    baseCents += fee;
    addonsCents += sumAddonCents(template, m.addonIds);
  }
  return { ok: true, baseCents, addonsCents };
}
