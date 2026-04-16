import React, { useState } from 'react';
import { COUNTRIES, getCountryName } from '../../../utils/countries';

interface Props {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  label: string;
  disabled?: boolean;
}

export default function CountryField({ value, onChange, required, label, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const matches = COUNTRIES
    .filter(c => c.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 10);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <button
        type="button" disabled={disabled}
        onClick={() => setOpen(!open)}
        className="w-full border rounded-lg px-3 py-2 text-left bg-white hover:border-indigo-400"
      >
        {value ? getCountryName(value) : <span className="text-slate-400">Select country…</span>}
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 bg-white border mt-1 rounded-lg shadow">
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Type to search…"
            className="w-full border-b px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">No matches</div>}
            {matches.map(c => (
              <button
                type="button" key={c.code}
                onClick={() => { onChange(c.code); setOpen(false); setQ(''); }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm"
              >
                {c.name} <span className="text-slate-400 text-xs">({c.code})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
