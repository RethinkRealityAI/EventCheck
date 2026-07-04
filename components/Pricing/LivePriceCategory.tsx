import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatPrice } from '../../utils/pricing';
import { shouldMaskCategoryPricing } from '../../utils/promoCodes';
import { isPromoActive, matchBracketToPeriod, shouldShowForCategory } from '../../utils/pricingPromo';
import { useLandingContent } from '../Portal/content/ContentProvider';
import { PromoPrice } from './PromoPrice';
import type { PricingTemplate, PricingTier, DateBracket } from '../../types';

interface Props {
  template: PricingTemplate;
  tier: PricingTier | null;
  bracket: DateBracket | null;
  value: string | null;
  onChange: (categoryId: string) => void;
}

function categoryPriceDisplay(
  cat: { id: string; name: string; requiresPromoCode?: boolean; prices?: Record<string, Record<string, number>> },
  tier: PricingTier | null,
  bracket: DateBracket | null,
  template: PricingTemplate,
  landing: ReturnType<typeof useLandingContent>,
): React.ReactNode | null {
  if (shouldMaskCategoryPricing(cat)) return 'Free';
  if (!tier || !bracket) return null;

  const priceCents = cat.prices?.[tier.id]?.[bracket.id];
  if (typeof priceCents !== 'number') return null;

  const promo = landing.pricingPromo;
  const promoPeriod = landing.fees.periods.find((p) => p.id === promo.promoPeriodId);
  const comparePeriod = landing.fees.periods.find((p) => p.id === promo.comparePeriodId);
  const promoBracket = promoPeriod ? matchBracketToPeriod(template.dateBrackets, promoPeriod.label) : null;
  const compareBracket = comparePeriod ? matchBracketToPeriod(template.dateBrackets, comparePeriod.label) : null;

  const showPromo =
    isPromoActive(promo, new Date())
    && promoBracket?.id === bracket.id
    && shouldShowForCategory(promo, cat.name);

  if (showPromo && compareBracket) {
    const oldCents = cat.prices?.[tier.id]?.[compareBracket.id];
    const oldPrice = typeof oldCents === 'number' ? oldCents / 100 : undefined;
    const newPrice = priceCents / 100;
    return (
      <PromoPrice
        oldPrice={oldPrice}
        newPrice={newPrice}
        currency={template.currency}
        config={promo}
        compact
      />
    );
  }

  return formatPrice(priceCents, template.currency);
}

export default function LivePriceCategory({ template, tier, bracket, value, onChange }: Props) {
  const landing = useLandingContent();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = template.categories.find(c => c.id === value) || null;
  const selectedSuffix = selected
    ? categoryPriceDisplay(selected, tier, bracket, template, landing)
    : null;

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
          className="w-full px-4 py-2.5 rounded-full gradient-border-input focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 font-body text-sm bg-white flex items-center justify-between text-left gap-3"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={`min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 ${selected ? 'text-gansid-on-surface' : 'text-gansid-on-surface/50'}`}>
            <span>{selected ? selected.name : 'Select a category…'}</span>
            {selected && selectedSuffix && (
              <span className="text-xs text-gansid-on-surface/60">{selectedSuffix}</span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-gansid-on-surface/60 transition-transform ${open ? 'rotate-180' : ''}`} />
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
              const suffix = categoryPriceDisplay(cat, tier, bracket, template, landing);
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
                  {suffix && (
                    <span className="text-xs text-gansid-on-surface/60 shrink-0">{suffix}</span>
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
