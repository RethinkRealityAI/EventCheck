import React from 'react';
import CountryField from '../FormBuilder/fields/CountryField';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  allSameCountry: boolean;
  allSameCategory: boolean;
  onToggleCountry: (v: boolean) => void;
  onToggleCategory: (v: boolean) => void;
  sharedCountry: string;
  sharedCategoryId: string | null;
  onSharedCountry: (code: string) => void;
  onSharedCategory: (id: string) => void;
}

export default function GroupShortcutsToggle(p: Props) {
  return (
    <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
      <p className="text-xs text-slate-600 leading-relaxed">
        Form default is a different country and registration category for each person. Only check the
        boxes below if either applies to <strong>every</strong> additional registrant.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.allSameCountry} onChange={e => p.onToggleCountry(e.target.checked)} />
        All additional registrants are from the same country
      </label>
      {p.allSameCountry && (
        <CountryField label="Country (all additional registrants)" value={p.sharedCountry} onChange={p.onSharedCountry} />
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={p.allSameCategory} onChange={e => p.onToggleCategory(e.target.checked)} />
        All additional registrants are the same category
      </label>
      {p.allSameCategory && p.tier && p.bracket && (
        <select
          value={p.sharedCategoryId ?? ''}
          onChange={e => p.onSharedCategory(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          <option value="">Select category…</option>
          {p.template.categories.map(cat => {
            const price = cat.prices?.[p.tier!.id]?.[p.bracket!.id];
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}{typeof price === 'number' ? ` — ${formatPrice(price, p.template.currency)}` : ''}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
