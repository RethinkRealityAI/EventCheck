// utils/pricing.ts
import type {
  PricingTemplate,
  PricingTier,
  DateBracket,
} from '../types';

/**
 * Returns the bracket whose [startDate, endDate] (inclusive) contains `now`,
 * evaluated naively against UTC. (Timezone sensitivity: bracket dates are
 * interpreted at local-midnight per the template.timezone; treating UTC here
 * is close enough given brackets are weeks wide. Server re-computes.)
 * If activeBracketOverride is set and refers to a real bracket, that wins.
 */
export function resolveBracket(
  template: PricingTemplate,
  now: Date,
): DateBracket | null {
  if (template.activeBracketOverride) {
    const forced = template.dateBrackets.find(b => b.id === template.activeBracketOverride);
    if (forced) return forced;
  }
  const t = now.getTime();
  for (const b of template.dateBrackets) {
    const start = new Date(`${b.startDate}T00:00:00Z`).getTime();
    // endDate inclusive through 23:59:59.999 UTC
    const end = new Date(`${b.endDate}T23:59:59.999Z`).getTime();
    if (t >= start && t <= end) return b;
  }
  return null;
}

/**
 * Finds the tier whose `countries` array contains `countryCode`.
 * Fallback: the LAST tier (safest — registrant pays the higher price rather
 * than the lower one if admin forgot to classify them).
 */
export function resolveTier(
  template: PricingTemplate,
  countryCode: string,
): PricingTier | null {
  if (!template.tiers.length) return null;
  const code = (countryCode || '').toUpperCase();
  for (const tier of template.tiers) {
    if (tier.countries.includes(code)) return tier;
  }
  return template.tiers[template.tiers.length - 1];
}

/**
 * Returns the full registration total in minor currency units, or null if
 * the category or tier×bracket price is missing.
 */
export function computeTotal(
  template: PricingTemplate,
  categoryId: string,
  tier: PricingTier,
  bracket: DateBracket,
  addonIds: string[],
): number | null {
  const category = template.categories.find(c => c.id === categoryId);
  if (!category) return null;
  const fee = category.prices?.[tier.id]?.[bracket.id];
  if (typeof fee !== 'number') return null;

  const addonTotal = addonIds.reduce((sum, id) => {
    const addon = template.addons.find(a => a.id === id);
    return sum + (addon?.price ?? 0);
  }, 0);

  return fee + addonTotal;
}

export function formatPrice(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}
