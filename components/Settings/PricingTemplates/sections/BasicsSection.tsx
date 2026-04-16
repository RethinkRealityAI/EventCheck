import React from 'react';
import type { PricingTemplate } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Toronto', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney',
];

const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR'];

export default function BasicsSection({ draft, onChange }: Props) {
  const bracketOptions = [
    { id: '', name: 'Auto-detect from dates' },
    ...draft.dateBrackets.map(b => ({ id: b.id, name: `Force: ${b.name}` })),
  ];
  return (
    <section className="border rounded-xl p-6 space-y-4">
      <h3 className="font-semibold">Basics</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-slate-600">Name</span>
          <input
            type="text" value={draft.name}
            onChange={e => onChange({ ...draft, name: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
            placeholder="GANSID Congress 2026 Pricing"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Currency</span>
          <select
            value={draft.currency}
            onChange={e => onChange({ ...draft, currency: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Timezone</span>
          <select
            value={draft.timezone}
            onChange={e => onChange({ ...draft, timezone: e.target.value })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">Active bracket</span>
          <select
            value={draft.activeBracketOverride ?? ''}
            onChange={e => onChange({ ...draft, activeBracketOverride: e.target.value || null })}
            className="mt-1 w-full border rounded-lg px-3 py-2"
          >
            {bracketOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}
