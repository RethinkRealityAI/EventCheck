import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { resolveBracket } from '../../../../utils/pricing';
import type { PricingTemplate, DateBracket } from '../../../../types';

interface Props {
  draft: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>;
  onChange: (d: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export default function DateBracketsSection({ draft, onChange }: Props) {
  const add = () => {
    const id = `bracket_${Date.now()}`;
    const next: DateBracket = { id, name: 'New bracket', startDate: '', endDate: '' };
    onChange({ ...draft, dateBrackets: [...draft.dateBrackets, next] });
  };
  const update = (id: string, patch: Partial<DateBracket>) => {
    onChange({
      ...draft,
      dateBrackets: draft.dateBrackets.map(b => b.id === id ? { ...b, ...patch } : b),
    });
  };
  const remove = (id: string) => {
    onChange({ ...draft, dateBrackets: draft.dateBrackets.filter(b => b.id !== id) });
  };

  const asTemplate: PricingTemplate = {
    ...draft, id: '', createdAt: '', updatedAt: '',
  } as PricingTemplate;
  const activeBracket = resolveBracket(asTemplate, new Date());

  return (
    <section className="border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Date brackets</h3>
        <button onClick={add} className="text-sm inline-flex items-center gap-1 text-indigo-600">
          <Plus className="w-4 h-4" /> Add bracket
        </button>
      </div>
      {draft.dateBrackets.length === 0 && (
        <div className="text-sm text-slate-400">No brackets yet.</div>
      )}
      <div className="space-y-2">
        {draft.dateBrackets.map(b => (
          <div key={b.id} className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${activeBracket?.id === b.id ? 'bg-green-500' : 'bg-slate-300'}`}
              title={activeBracket?.id === b.id ? 'Currently active' : ''}
            />
            <input
              className="border rounded px-2 py-1 text-sm flex-1"
              value={b.name}
              onChange={e => update(b.id, { name: e.target.value })}
            />
            <input type="date" className="border rounded px-2 py-1 text-sm" value={b.startDate} onChange={e => update(b.id, { startDate: e.target.value })} />
            <span className="text-slate-400">→</span>
            <input type="date" className="border rounded px-2 py-1 text-sm" value={b.endDate} onChange={e => update(b.id, { endDate: e.target.value })} />
            <button onClick={() => remove(b.id)} className="p-1.5 hover:bg-slate-100 rounded" title="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
