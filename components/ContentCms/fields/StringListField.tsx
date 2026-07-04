import React from 'react';
import { X, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { CmsButton, CmsFieldLabel, cmsInputClass } from '../cmsUi';

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

  const iconBtn =
    'p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="block">
      <CmsFieldLabel>{label}</CmsFieldLabel>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              type="text"
              value={item}
              onChange={(e) => updateAt(index, e.target.value)}
              className={`${cmsInputClass} flex-1`}
              placeholder={`Item ${index + 1}`}
            />
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
        ))}
      </div>
      <CmsButton variant="ghost" onClick={addItem} className="mt-3 !px-3 !py-2 text-[#2260a1]">
        <Plus className="h-4 w-4" /> Add line
      </CmsButton>
    </div>
  );
}
