import React from 'react';

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
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(preset.value)}
              title={preset.label}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
                value === preset.value
                  ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span
                className="w-3.5 h-3.5 rounded-full border border-black/10 flex-shrink-0"
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
          value={/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
