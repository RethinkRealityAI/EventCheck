import React, { useMemo } from 'react';
import CountryField from '../FormBuilder/fields/CountryField';
import { formatPrice, resolveTier } from '../../utils/pricing';
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
  // When "all same country" is checked, resolve tier from the shared country —
  // not from the purchaser's tier — so the category dropdown shows the correct
  // price tier for everyone it applies to.
  const effectiveTier = useMemo<PricingTier | null>(() => {
    if (p.allSameCountry && p.sharedCountry) {
      return resolveTier(p.template, p.sharedCountry);
    }
    return p.tier;
  }, [p.template, p.allSameCountry, p.sharedCountry, p.tier]);

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
      {p.allSameCategory && effectiveTier && p.bracket && (
        <>
          <select
            value={p.sharedCategoryId ?? ''}
            onChange={e => p.onSharedCategory(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select category…</option>
            {p.template.categories.map(cat => {
              const price = cat.prices?.[effectiveTier.id]?.[p.bracket!.id];
              return (
                <option key={cat.id} value={cat.id}>
                  {cat.name}{typeof price === 'number' ? ` — ${formatPrice(price, p.template.currency)}` : ''}
                </option>
              );
            })}
          </select>
          {!p.allSameCountry && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed">
              <strong>Heads up:</strong> the prices above are based on <strong>{effectiveTier.name}</strong>. Since each registrant may be from a different country, their actual price will resolve from <em>their own</em> country tier — the grand total at checkout reflects everyone's individual pricing.
            </p>
          )}
        </>
      )}
    </div>
  );
}
