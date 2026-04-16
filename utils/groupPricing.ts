import { resolveBracket, resolveTier, computeTotal } from './pricing';
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
