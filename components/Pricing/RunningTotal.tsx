import React from 'react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate } from '../../types';

export default function RunningTotal({
  template, total, bracket, tier,
}: {
  template: PricingTemplate;
  total: number | null;
  bracket: { name: string } | null;
  tier: { name: string } | null;
}) {
  if (total == null) return null;
  return (
    <div className="sticky bottom-4 mt-6 p-4 bg-white shadow-lg rounded-xl border flex items-center justify-between">
      <div>
        <div className="text-xs text-slate-500 uppercase tracking-wider">Total</div>
        <div className="text-2xl font-bold">{formatPrice(total, template.currency)}</div>
        {bracket && tier && (
          <div className="text-xs text-slate-500 mt-0.5">{bracket.name} · {tier.name}</div>
        )}
      </div>
    </div>
  );
}
