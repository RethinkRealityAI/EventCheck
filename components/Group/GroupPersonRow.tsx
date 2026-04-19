import React from 'react';
import CountryField from '../FormBuilder/fields/CountryField';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  index: number;
  isPrimary: boolean;
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  name: string;
  email: string;
  countryCode: string;
  categoryId: string | null;
  hasAllInfo: boolean;
  hideCountry: boolean;
  hideCategory: boolean;
  onChange: (patch: Partial<{ name: string; email: string; countryCode: string; categoryId: string | null }>) => void;
}

export default function GroupPersonRow(p: Props) {
  const displayPrice = (() => {
    if (!p.tier || !p.bracket || !p.categoryId) return null;
    const cat = p.template.categories.find(c => c.id === p.categoryId);
    const cents = cat?.prices?.[p.tier.id]?.[p.bracket.id];
    return typeof cents === 'number' ? formatPrice(cents, p.template.currency) : null;
  })();

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-center">
        <div className="font-medium text-sm">
          Additional Registrant {p.index + 1}
        </div>
        {displayPrice && <div className="text-sm font-semibold text-indigo-700">{displayPrice}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="border rounded px-2 py-1 text-sm" placeholder="Full Name" value={p.name}
          onChange={e => p.onChange({ name: e.target.value })} />
        <input type="email" className="border rounded px-2 py-1 text-sm" placeholder="Email" value={p.email}
          onChange={e => p.onChange({ email: e.target.value })} />
      </div>
      {!p.hideCountry && (
        <CountryField label="Country" value={p.countryCode}
          onChange={code => p.onChange({ countryCode: code })} />
      )}
      {!p.hideCategory && p.tier && p.bracket && (
        <select value={p.categoryId ?? ''} onChange={e => p.onChange({ categoryId: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm">
          <option value="">Select category…</option>
          {p.template.categories.map(cat => {
            const cents = cat.prices?.[p.tier!.id]?.[p.bracket!.id];
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}{typeof cents === 'number' ? ` — ${formatPrice(cents, p.template.currency)}` : ''}
              </option>
            );
          })}
        </select>
      )}
      {p.hasAllInfo && !p.isPrimary && (
        <p className="text-xs text-slate-400 italic">
          Additional fields (dietary, consent, etc.) for this person will appear on their ticket only
          after they receive and confirm their registration link.
        </p>
      )}
    </div>
  );
}
