import React from 'react';
import { Sparkles } from 'lucide-react';
import { formatPrice } from '../../utils/pricing';
import {
  isPromoActive,
  matchBracketToPeriod,
  promoColors,
  parseCustomPromoStyle,
  shouldShowForCategory,
} from '../../utils/pricingPromo';
import { useLandingContent } from '../Portal/content/ContentProvider';
import type { PricingTemplate } from '../../types';

export default function RunningTotal({
  template, total, bracket, tier, showTier = true, label, showAsFree = false, categoryKey,
}: {
  template: PricingTemplate;
  total: number | null;
  bracket: { id: string; name: string } | null;
  tier: { name: string } | null;
  showTier?: boolean;
  label?: string;
  showAsFree?: boolean;
  /** Pricing-template category name; must match fees-table category strings when promo is scoped. */
  categoryKey?: string | null;
}) {
  const { pricingPromo, fees } = useLandingContent();

  if (total == null) return null;

  const promoPeriod = fees.periods.find((p) => p.id === pricingPromo.promoPeriodId);
  const promoBracket = promoPeriod
    ? matchBracketToPeriod(template.dateBrackets, promoPeriod.label)
    : null;
  const categoryOk =
    categoryKey == null
      ? pricingPromo.categories === 'all'
      : shouldShowForCategory(pricingPromo, categoryKey);
  const showPromoBadge =
    isPromoActive(pricingPromo, new Date())
    && promoBracket?.id === bracket?.id
    && categoryOk;

  const colorToken = promoColors(pricingPromo);
  const customStyle = parseCustomPromoStyle(colorToken);
  const promoClass = customStyle
    ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-display font-semibold'
    : `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-display font-semibold ${colorToken}`;

  const bracketName = bracket?.name ?? '';
  const isEarlyBird = /early/i.test(bracketName);

  return (
    <div className="sticky bottom-4 mt-6 p-4 bg-white shadow-lg rounded-2xl border border-gansid-outline-variant/30 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-display text-gansid-on-surface/50 uppercase tracking-wider mb-1">{label ?? 'Total'}</div>
        <div className="text-2xl font-display font-bold text-gansid-on-surface">
          {showAsFree ? 'Free' : formatPrice(total, template.currency)}
        </div>
        {!showAsFree && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {bracket && (
            showPromoBadge ? (
              <span className={promoClass} style={customStyle ?? undefined}>
                <Sparkles className="w-3 h-3" />
                {pricingPromo.label}
              </span>
            ) : (
              <span
                className={[
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-display font-semibold',
                  isEarlyBird
                    ? 'bg-gansid-primary-gradient text-white shadow-sm'
                    : 'bg-gansid-secondary/10 text-gansid-secondary',
                ].join(' ')}
              >
                {isEarlyBird && <Sparkles className="w-3 h-3" />}
                {bracket.name}
              </span>
            )
          )}
          {showTier && tier && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-display font-semibold bg-gansid-surface-container-low text-gansid-on-surface/70">
              {tier.name}
            </span>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
