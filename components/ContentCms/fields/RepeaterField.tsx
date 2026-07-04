import React from 'react';
import { X, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { CmsButton, CmsFieldLabel, cmsInputClass } from '../cmsUi';

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

  const iconBtn =
    'p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div className="block">
      <CmsFieldLabel>{label}</CmsFieldLabel>
      <div className="space-y-3">
        {items.map((item, index) => {
          const key = (item as { id?: string })?.id ?? index;
          return (
            <div
              key={key}
              className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 shadow-sm ring-1 ring-slate-100"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-display font-bold uppercase tracking-wider text-slate-400 ring-1 ring-slate-200">
                  Item {index + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => moveUp(index)} disabled={index === 0} className={iconBtn} title="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={index === items.length - 1}
                    className={iconBtn}
                    title="Move down"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {renderItem(item, (p) => patchAt(index, p))}
            </div>
          );
        })}
      </div>
      <CmsButton variant="ghost" onClick={addItem} className="mt-3 !px-3 !py-2 text-[#2260a1]">
        <Plus className="h-4 w-4" /> Add item
      </CmsButton>
    </div>
  );
}
