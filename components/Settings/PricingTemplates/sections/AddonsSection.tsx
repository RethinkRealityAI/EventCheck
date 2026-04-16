import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PricingTemplate, PricingAddon } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function AddonsSection({ draft, onChange }: Props) {
  const add = () => {
    const id = `addon_${Date.now()}`;
    const next: PricingAddon = { id, name: 'New add-on', description: '', price: 0 };
    onChange({ ...draft, addons: [...draft.addons, next] });
  };
  const update = (id: string, patch: Partial<PricingAddon>) => {
    onChange({ ...draft, addons: draft.addons.map(a => a.id === id ? { ...a, ...patch } : a) });
  };
  const remove = (id: string) => {
    onChange({ ...draft, addons: draft.addons.filter(a => a.id !== id) });
  };

  return (
    <section className="border rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Add-ons</h3>
        <button onClick={add} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add add-on
        </button>
      </div>
      <div className="space-y-2">
        {draft.addons.map(a => (
          <div key={a.id} className="grid grid-cols-12 gap-2 items-center">
            <input className="col-span-3 border rounded px-2 py-1 text-sm" value={a.name}
              onChange={e => update(a.id, { name: e.target.value })} placeholder="Name" />
            <input className="col-span-6 border rounded px-2 py-1 text-sm" value={a.description}
              onChange={e => update(a.id, { description: e.target.value })} placeholder="Description" />
            <input type="number" step="0.01" min={0}
              className="col-span-2 border rounded px-2 py-1 text-sm text-right"
              value={(a.price / 100).toFixed(2)}
              onChange={e => update(a.id, { price: Math.round(Number(e.target.value) * 100) })} />
            <button onClick={() => remove(a.id)} className="col-span-1 p-1 hover:bg-slate-100 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
