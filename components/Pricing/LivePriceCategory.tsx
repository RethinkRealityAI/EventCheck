import React from 'react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  value: string | null;
  onChange: (categoryId: string) => void;
}

export default function LivePriceCategory({ template, tier, bracket, value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Registration Category <span className="text-red-500">*</span></span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white"
        required
      >
        <option value="" disabled>Select a category…</option>
        {template.categories.map(cat => {
          const price = tier && bracket ? cat.prices?.[tier.id]?.[bracket.id] : undefined;
          return (
            <option key={cat.id} value={cat.id}>
              {cat.name}{typeof price === 'number' ? ` — ${formatPrice(price, template.currency)}` : ''}
            </option>
          );
        })}
      </select>
    </label>
  );
}
