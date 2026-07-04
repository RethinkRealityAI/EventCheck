import React, { useState } from 'react';
import { ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import type { PromoColorPreset } from '../../types';

/** Shared CMS chrome — GANSID-accented admin panels. */
export const cmsInputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200/90 bg-white text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#2260a1]/30 focus:border-[#2260a1]/40';

export const cmsLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

export function CmsFieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className={cmsLabelClass}>{children}</span>
      {hint && <p className="text-xs text-slate-400 -mt-0.5">{hint}</p>}
    </div>
  );
}

export function CmsButton({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:
      'bg-gansid-primary-gradient text-white shadow-[0_8px_20px_-10px_rgba(186,0,40,0.65)] hover:shadow-[0_12px_24px_-10px_rgba(186,0,40,0.75)] hover:scale-[1.01] active:scale-[0.99]',
    secondary: 'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-50 text-red-700 border border-red-100 hover:bg-red-100',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function CmsSelect({
  value,
  onChange,
  children,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${cmsInputClass} ${className}`}>
      {children}
    </select>
  );
}

export function CmsToggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? 'bg-[#2260a1]' : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
      </span>
    </label>
  );
}

export function SectionCard({
  title,
  description,
  onReset,
  children,
  defaultOpen = false,
  accent = 'red',
}: {
  title: string;
  description?: string;
  onReset: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: 'red' | 'blue' | 'neutral';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rail =
    accent === 'blue' ? 'bg-gansid-secondary'
    : accent === 'red' ? 'bg-gansid-primary-gradient'
    : 'bg-slate-300';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_-18px_rgba(15,23,42,0.25)] ring-1 ring-slate-200/80">
      <div className={`absolute inset-y-0 left-0 w-1 ${rail}`} aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 pl-6 text-left hover:bg-slate-50/80 transition-colors"
      >
        <div className="min-w-0">
          <h4 className="font-display font-bold text-slate-900">{title}</h4>
          {description && <p className="text-sm text-slate-500 mt-0.5 truncate">{description}</p>}
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pl-6 space-y-4 border-t border-slate-100 pt-4">
            {children}
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#2260a1] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset section to default
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CmsPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h3 className="font-display text-xl font-bold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const PROMO_SWATCHES: { id: PromoColorPreset; label: string; className?: string; style?: React.CSSProperties }[] = [
  { id: 'gansid-red', label: 'Congress', className: 'bg-gansid-primary-gradient' },
  { id: 'gansid-blue', label: 'Blue', className: 'bg-gansid-secondary' },
  { id: 'save-green', label: 'Save', className: 'bg-emerald-500' },
  { id: 'amber', label: 'Amber', className: 'bg-amber-500' },
  { id: 'custom', label: 'Custom', className: 'bg-gradient-to-br from-slate-700 to-slate-900' },
];

export function PromoColorPresets({
  value,
  onChange,
}: {
  value: PromoColorPreset;
  onChange: (v: PromoColorPreset) => void;
}) {
  return (
    <div>
      <CmsFieldLabel>Badge color</CmsFieldLabel>
      <div className="flex flex-wrap gap-2">
        {PROMO_SWATCHES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              value === s.id
                ? 'border-[#2260a1] ring-2 ring-[#2260a1]/25 bg-[#2260a1]/5 text-[#1a4880]'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <span className={`h-4 w-4 rounded-full ring-1 ring-black/10 ${s.className ?? ''}`} style={s.style} />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CmsSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-8 w-8 animate-spin text-[#2260a1]" />
      {label && <p className="mt-3 text-sm">{label}</p>}
    </div>
  );
}
