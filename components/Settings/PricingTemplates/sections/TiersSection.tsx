import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { COUNTRIES, getCountryName } from '../../../../utils/countries';
import type { PricingTemplate, PricingTier } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function TiersSection({ draft, onChange }: Props) {
  const updateTier = (tierId: string, patch: Partial<PricingTier>) => {
    onChange({ ...draft, tiers: draft.tiers.map(t => t.id === tierId ? { ...t, ...patch } : t) });
  };

  const assignCountry = (tierId: string, code: string) => {
    onChange({
      ...draft,
      tiers: draft.tiers.map(t => ({
        ...t,
        countries: t.id === tierId
          ? Array.from(new Set([...t.countries, code]))
          : t.countries.filter(c => c !== code),
      })),
    });
  };

  const removeCountry = (tierId: string, code: string) => {
    updateTier(tierId, {
      countries: draft.tiers.find(t => t.id === tierId)!.countries.filter(c => c !== code),
    });
  };

  const addTier = () => {
    const newId = `tier${draft.tiers.length + 1}`;
    onChange({
      ...draft,
      tiers: [...draft.tiers, { id: newId, name: `Tier ${draft.tiers.length + 1}`, label: '', countries: [] }],
    });
  };

  const assigned = new Set(draft.tiers.flatMap(t => t.countries));
  const unassigned = COUNTRIES.filter(c => !assigned.has(c.code));

  return (
    <section className="border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tiers &amp; country mapping</h3>
        <button onClick={addTier} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add tier
        </button>
      </div>

      {draft.tiers.map(tier => (
        <div key={tier.id} className="border rounded-lg p-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="flex-shrink-0 w-32 border rounded px-2 py-1 text-sm font-medium"
              value={tier.name}
              onChange={e => updateTier(tier.id, { name: e.target.value })}
            />
            <input
              className="flex-1 border rounded px-2 py-1 text-sm text-slate-600"
              placeholder="Label (e.g. Asia, Africa, South America...)"
              value={tier.label}
              onChange={e => updateTier(tier.id, { label: e.target.value })}
            />
          </div>
          <CountryPicker tierId={tier.id} onPick={assignCountry} excludeCodes={tier.countries} />
          <div className="flex flex-wrap gap-1.5">
            {tier.countries.map(code => (
              <span key={code} className="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-0.5 text-xs">
                {getCountryName(code)}
                <button onClick={() => removeCountry(tier.id, code)} className="hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {tier.countries.length === 0 && (
              <span className="text-xs text-slate-400">No countries in this tier yet.</span>
            )}
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm">
          <strong>{unassigned.length}</strong> countries are unassigned. Registrants from these
          countries will fall back to the last tier ({draft.tiers[draft.tiers.length - 1]?.name ?? 'none'}).
        </div>
      )}
    </section>
  );
}

function CountryPicker({ onPick, excludeCodes, tierId }:
  { onPick: (tierId: string, code: string) => void; excludeCodes: string[]; tierId: string }) {
  const [q, setQ] = useState('');
  const matches = COUNTRIES.filter(c =>
    !excludeCodes.includes(c.code) && c.name.toLowerCase().includes(q.toLowerCase())
  ).slice(0, 8);
  return (
    <div className="relative">
      <input
        value={q} onChange={e => setQ(e.target.value)}
        placeholder="Search to add a country\u2026"
        className="w-full border rounded px-2 py-1.5 text-sm"
      />
      {q && matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 bg-white border mt-1 rounded shadow max-h-48 overflow-y-auto">
          {matches.map(c => (
            <button
              key={c.code} type="button"
              onClick={() => { onPick(tierId, c.code); setQ(''); }}
              className="w-full text-left px-2 py-1 hover:bg-indigo-50 text-sm"
            >
              {c.name} <span className="text-slate-400">({c.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
