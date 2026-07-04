import React from 'react';
import { X, ChevronUp, ChevronDown, Plus } from 'lucide-react';

export function StringListField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const updateAt = (index: number, value: string) => {
    const next = items.slice();
    next[index] = value;
    onChange(next);
  };

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

  const addItem = () => {
    onChange([...items, '']);
  };

  return (
    <div className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              type="text"
              value={item}
              onChange={(e) => updateAt(index, e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => moveUp(index)}
              disabled={index === 0}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
              title="Move up"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => moveDown(index)}
              disabled={index === items.length - 1}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
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
        ))}
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
