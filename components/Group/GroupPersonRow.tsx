import React, { useMemo } from 'react';
import CountryField from '../FormBuilder/fields/CountryField';
import { formatPrice, resolveTier } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket, FormField } from '../../types';
import GuestFullDetailsInline from './GuestFullDetailsInline';

interface Props {
  index: number;
  isPrimary: boolean;
  template: PricingTemplate;
  /** Purchaser's active tier — ONLY used as a fallback when the member has no country set.
   *  The member's own tier is resolved from their own countryCode. */
  tier: PricingTier | null;
  bracket: DateBracket | null;
  name: string;
  email: string;
  countryCode: string;
  categoryId: string | null;
  hasAllInfo: boolean;
  hideCountry: boolean;
  hideCategory: boolean;
  /** Only rendered when hasAllInfo=true. Supplies the full form field list so the inline
   *  panel can render every per-guest question except RMS/ticket/identity-fields. */
  formFields?: FormField[];
  fullAnswers?: Record<string, any>;
  onChange: (patch: Partial<{ name: string; email: string; countryCode: string; categoryId: string | null; fullAnswers: Record<string, any> }>) => void;
}

export default function GroupPersonRow(p: Props) {
  // Resolve this MEMBER's tier from their own country code. Using the purchaser's
  // tier (passed in via `p.tier`) would mis-price anyone in a different region —
  // server-side total is still correct, but displayed row price was misleading.
  const memberTier = useMemo<PricingTier | null>(() => {
    if (p.countryCode) return resolveTier(p.template, p.countryCode);
    return p.tier; // fallback until the member picks a country
  }, [p.template, p.countryCode, p.tier]);

  const displayPrice = (() => {
    if (!memberTier || !p.bracket || !p.categoryId) return null;
    const cat = p.template.categories.find(c => c.id === p.categoryId);
    const cents = cat?.prices?.[memberTier.id]?.[p.bracket.id];
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
      {!p.hideCategory && memberTier && p.bracket && (
        <select value={p.categoryId ?? ''} onChange={e => p.onChange({ categoryId: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm">
          <option value="">Select category…</option>
          {p.template.categories.map(cat => {
            const cents = cat.prices?.[memberTier.id]?.[p.bracket!.id];
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name}{typeof cents === 'number' ? ` — ${formatPrice(cents, p.template.currency)}` : ''}
              </option>
            );
          })}
        </select>
      )}
      {p.hasAllInfo && p.formFields && (
        <GuestFullDetailsInline
          formFields={p.formFields}
          fullAnswers={p.fullAnswers ?? {}}
          onChange={(full) => p.onChange({ fullAnswers: full })}
        />
      )}
    </div>
  );
}
