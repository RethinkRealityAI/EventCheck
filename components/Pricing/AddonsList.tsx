import React from 'react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate } from '../../types';

interface Props {
  template: PricingTemplate;
  selectedIds: string[];
  onToggle: (ids: string[]) => void;
}

export default function AddonsList({ template, selectedIds, onToggle }: Props) {
  if (template.addons.length === 0) return null;
  const toggle = (id: string) => {
    onToggle(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Optional add-ons</h3>
      {template.addons.map(a => (
        <label key={a.id} className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" className="mt-0.5"
            checked={selectedIds.includes(a.id)} onChange={() => toggle(a.id)} />
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="font-medium">{a.name}</span>
              <span className="font-semibold">{formatPrice(a.price, template.currency)}</span>
            </div>
            {a.description && <p className="text-xs text-slate-500 mt-1">{a.description}</p>}
          </div>
        </label>
      ))}
    </div>
  );
}
