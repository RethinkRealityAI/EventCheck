import React from 'react';
import { CmsFieldLabel, cmsInputClass } from '../cmsUi';

export function ColorField({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets?: { label: string; value: string }[];
}) {
  return (
    <div className="block">
      <CmsFieldLabel>{label}</CmsFieldLabel>
      {presets && presets.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              title={preset.label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                value === preset.value
                  ? 'border-[#2260a1] ring-2 ring-[#2260a1]/25 bg-[#2260a1]/5 text-[#1a4880]'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: preset.value }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : '#ba0028'}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-11 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          className={`${cmsInputClass} flex-1 font-mono`}
        />
      </div>
    </div>
  );
}
