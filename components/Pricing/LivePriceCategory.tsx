import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatPrice } from '../../utils/pricing';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  value: string | null;
  onChange: (categoryId: string) => void;
}

export default function LivePriceCategory({ template, tier, bracket, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = template.categories.find(c => c.id === value) || null;
  const selectedPrice = selected && tier && bracket ? selected.prices?.[tier.id]?.[bracket.id] : undefined;

  // Decide whether to open upward based on available viewport space below the trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estHeight = Math.min(320, template.categories.length * 44 + 16);
    setDropUp(spaceBelow < estHeight && spaceAbove > spaceBelow);
  }, [open, template.categories.length]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!listRef.current || !triggerRef.current) return;
      if (listRef.current.contains(e.target as Node) || triggerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="block">
      <span className="block text-xs font-display font-semibold text-gansid-on-surface/70 uppercase tracking-wide mb-1.5">
        Registration Category <span className="text-gansid-primary">*</span>
      </span>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full px-4 py-2.5 rounded-full gradient-border-input focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 font-body text-sm bg-white flex items-center justify-between text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={selected ? 'text-gansid-on-surface' : 'text-gansid-on-surface/50'}>
            {selected
              ? `${selected.name}${typeof selectedPrice === 'number' ? ` — ${formatPrice(selectedPrice, template.currency)}` : ''}`
              : 'Select a category…'}
          </span>
          <ChevronDown className={`w-4 h-4 text-gansid-on-surface/60 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            ref={listRef}
            role="listbox"
            className={`absolute left-0 right-0 z-30 bg-white rounded-2xl shadow-xl border border-gansid-outline-variant/30 py-1 max-h-[320px] overflow-y-auto ${
              dropUp ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {template.categories.map(cat => {
              const price = tier && bracket ? cat.prices?.[tier.id]?.[bracket.id] : undefined;
              const isSelected = cat.id === value;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { onChange(cat.id); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm font-body transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-gansid-primary-container/10 text-gansid-primary font-semibold'
                      : 'text-gansid-on-surface hover:bg-gansid-surface-container-low'
                  }`}
                >
                  <span>{cat.name}</span>
                  {typeof price === 'number' && (
                    <span className="text-xs text-gansid-on-surface/60">{formatPrice(price, template.currency)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
