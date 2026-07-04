import React from 'react';
import { X, ChevronUp, ChevronDown, Plus } from 'lucide-react';

export function RepeaterField<T>({
  label,
  items,
  onChange,
  newItem,
  renderItem,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  renderItem: (item: T, patch: (p: Partial<T>) => void) => React.ReactNode;
}) {
  const removeAt = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = items.slice();
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const moveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const next = items.slice();
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const patchAt = (index: number, p: Partial<T>) => {
    const next = items.slice();
    next[index] = { ...next[index], ...p };
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, newItem()]);
  };

  return (
    <div className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="space-y-3">
        {items.map((item, index) => {
          const key = (item as any)?.id ?? index;
          return (
            <div key={key} className="border border-slate-200 rounded-xl p-4 bg-slate-50/60">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Item {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={index === items.length - 1}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    title="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {renderItem(item, (p) => patchAt(index, p))}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
      >
        <Plus className="w-4 h-4" /> Add
      </button>
    </div>
  );
}
