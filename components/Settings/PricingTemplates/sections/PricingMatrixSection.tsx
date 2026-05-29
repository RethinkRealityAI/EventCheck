import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PricingTemplate, PricingCategory } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function PricingMatrixSection({ draft, onChange }: Props) {
  const addCategory = () => {
    const id = `cat_${Date.now()}`;
    const next: PricingCategory = { id, name: 'New category', prices: {} };
    onChange({ ...draft, categories: [...draft.categories, next] });
  };
  const updateCategory = (id: string, patch: Partial<PricingCategory>) => {
    onChange({
      ...draft,
      categories: draft.categories.map(c => c.id === id ? { ...c, ...patch } : c),
    });
  };
  const removeCategory = (id: string) => {
    onChange({ ...draft, categories: draft.categories.filter(c => c.id !== id) });
  };
  const setCell = (catId: string, tierId: string, bracketId: string, value: string) => {
    const cents = Math.round(Number(value) * 100);
    const cat = draft.categories.find(c => c.id === catId);
    if (!cat) return;
    const prices = { ...cat.prices, [tierId]: { ...(cat.prices?.[tierId] ?? {}), [bracketId]: cents } };
    updateCategory(catId, { prices });
  };

  if (draft.tiers.length === 0 || draft.dateBrackets.length === 0) {
    return (
      <section className="border rounded-xl p-6 space-y-2">
        <h3 className="font-semibold">Pricing matrix</h3>
        <p className="text-sm text-slate-500">
          Add at least one tier and one date bracket first, then prices will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="border rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Pricing matrix</h3>
        <button onClick={addCategory} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add category
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr>
              <th rowSpan={2} className="text-left border px-2 py-1 bg-slate-50">Category</th>
              {draft.tiers.map(t => (
                <th key={t.id} colSpan={draft.dateBrackets.length} className="text-center border px-2 py-1 bg-slate-50">
                  {t.name}
                </th>
              ))}
              <th rowSpan={2} className="border"></th>
            </tr>
            <tr>
              {draft.tiers.flatMap(t =>
                draft.dateBrackets.map(b => (
                  <th key={`${t.id}-${b.id}`} className="text-center border px-2 py-1 text-xs text-slate-500 bg-slate-50">
                    {b.name}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {draft.categories.map(cat => (
              <tr key={cat.id}>
                <td className="border px-2 py-1 align-top">
                  <input
                    className="w-full border rounded px-1 py-0.5 mb-1"
                    value={cat.name}
                    onChange={e => updateCategory(cat.id, { name: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-[10px] text-slate-600 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={cat.requiresPromoCode === true}
                      onChange={e => updateCategory(cat.id, { requiresPromoCode: e.target.checked || undefined })}
                    />
                    Requires promo code
                  </label>
                </td>
                {draft.tiers.flatMap(t => draft.dateBrackets.map(b => (
                  <td key={`${cat.id}-${t.id}-${b.id}`} className="border px-1 py-1">
                    <input
                      type="number" step="0.01" min={0}
                      className="w-20 border rounded px-1 py-0.5 text-right"
                      value={(((cat.prices?.[t.id]?.[b.id]) ?? 0) / 100).toFixed(2)}
                      onChange={e => setCell(cat.id, t.id, b.id, e.target.value)}
                    />
                  </td>
                )))}
                <td className="border px-1 py-1">
                  <button onClick={() => removeCategory(cat.id)} className="p-1 hover:bg-slate-100 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Prices entered in {draft.currency}; stored as minor units (cents) internally.</p>
    </section>
  );
}
