import React from 'react';
import { Sparkles } from 'lucide-react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate } from '../../types';

export default function RunningTotal({
  template, total, bracket, tier, showTier = true, label,
}: {
  template: PricingTemplate;
  total: number | null;
  bracket: { name: string } | null;
  tier: { name: string } | null;
  /** Hide the tier pill when the total spans multiple tiers (e.g. mixed-country group). */
  showTier?: boolean;
  /** Optional override for the "Total" label (e.g. "Group total (4 people)"). */
  label?: string;
}) {
  if (total == null) return null;
  const bracketName = bracket?.name ?? '';
  const isEarlyBird = /early/i.test(bracketName);
  return (
    <div className="sticky bottom-4 mt-6 p-4 bg-white shadow-lg rounded-2xl border border-gansid-outline-variant/30 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[11px] font-display text-gansid-on-surface/50 uppercase tracking-wider mb-1">{label ?? 'Total'}</div>
        <div className="text-2xl font-display font-bold text-gansid-on-surface">
          {formatPrice(total, template.currency)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {bracket && (
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
          )}
          {showTier && tier && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-display font-semibold bg-gansid-surface-container-low text-gansid-on-surface/70">
              {tier.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
