import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FormField } from '../../types';

interface Props {
  /** All form fields — we filter to the ones a per-guest panel should show. */
  formFields: FormField[];
  /** Full answers for THIS guest, keyed by form field id. */
  fullAnswers: Record<string, any>;
  onChange: (fullAnswers: Record<string, any>) => void;
  /** Header label for the accordion, e.g. "Full details" */
  heading?: string;
}

// Fields a guest shouldn't see per-row:
//  - RMS (global toggle, not per-guest)
//  - ticket (payment is the purchaser's job)
//  - First Name / Last Name / Email / Country → already captured at top of row
//  - Pricing category (captured via country dropdown + separate category dropdown at top)
const EXCLUDED_FIELD_IDS = new Set([
  'f_fname', 'f_lname', 'f_email', 'f_country',
]);
const EXCLUDED_FIELD_TYPES = new Set(['registration-mode-selector', 'ticket', 'country']);

export default function GuestFullDetailsInline({ formFields, fullAnswers, onChange, heading = 'Full details' }: Props) {
  const [open, setOpen] = useState(false);

  const fields = formFields.filter(f =>
    !EXCLUDED_FIELD_TYPES.has(f.type as any)
    && !EXCLUDED_FIELD_IDS.has(f.id)
    // Allow fields with any id — including the time-suffixed ones the template
    // builder emits (f_${now}_fname etc.). Match by suffix pattern too.
    && !/_fname$|_lname$|_email$|_country$/.test(f.id),
  );

  const update = (fieldId: string, v: any) => {
    onChange({ ...fullAnswers, [fieldId]: v });
  };

  return (
    <div className="border-t border-slate-200 mt-2 pt-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
      >
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {heading} {open ? '' : '(click to expand)'}
      </button>
      {open && (
        <div className="mt-3 space-y-3 pl-5 border-l-2 border-slate-100">
          {fields.map(field => {
            const value = fullAnswers?.[field.id];
            if (field.type === 'textarea') {
              return (
                <div key={field.id}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                  <textarea
                    rows={2}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                    placeholder={field.placeholder}
                    value={value || ''}
                    onChange={e => update(field.id, e.target.value)}
                  />
                </div>
              );
            }
            if (field.type === 'select') {
              return (
                <div key={field.id}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                  <select
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                    value={value || ''}
                    onChange={e => update(field.id, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              );
            }
            if (field.type === 'radio') {
              return (
                <div key={field.id}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                  <div className="flex flex-wrap gap-2">
                    {field.options?.map(opt => {
                      const sel = value === opt;
                      return (
                        <label key={opt} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer ${sel ? 'border-gansid-primary bg-gansid-primary-container/10 font-semibold' : 'border-slate-300 hover:border-gansid-primary/50'}`}>
                          <input type="radio" name={`${field.id}_guest`} checked={sel} onChange={() => update(field.id, opt)} />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (field.type === 'checkbox') {
              const arr: string[] = Array.isArray(value) ? value : [];
              return (
                <div key={field.id}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                  <div className="flex flex-wrap gap-2">
                    {field.options?.map(opt => {
                      const checked = arr.includes(opt);
                      return (
                        <label key={opt} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs cursor-pointer ${checked ? 'border-gansid-secondary bg-gansid-secondary/10 font-semibold' : 'border-slate-300 hover:border-gansid-secondary/50'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => update(field.id, e.target.checked ? [...arr, opt] : arr.filter(x => x !== opt))}
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            }
            if (field.type === 'boolean') {
              return (
                <label key={field.id} className="flex items-start gap-2 text-xs text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={!!value} onChange={e => update(field.id, e.target.checked)} />
                  <span>{field.label} {field.required && <span className="text-red-500">*</span>}</span>
                </label>
              );
            }
            // Default: text-like input (text, email, phone, number)
            return (
              <div key={field.id}>
                <label className="block text-xs font-medium text-slate-700 mb-1">{field.label} {field.required && <span className="text-red-500">*</span>}</label>
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                  placeholder={field.placeholder}
                  value={value || ''}
                  onChange={e => update(field.id, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
