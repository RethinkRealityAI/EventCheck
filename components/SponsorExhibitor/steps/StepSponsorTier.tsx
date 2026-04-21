import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Form, TicketItem } from '../../../types';
import { ChevronDown } from 'lucide-react';

const TIER_COLORS: Record<string, string> = {
  signature: 'bg-red-600',
  gold: 'bg-amber-500',
  silver: 'bg-slate-400',
  award: 'bg-blue-600',
  scholarship: 'bg-emerald-600',
};

const TIER_QUOTAS: Record<string, number> = {
  signature: 16,
  gold: 8,
  silver: 8,
  award: 0,
  scholarship: 0,
};

const GOLD_AWARDS = ['Nursing', 'Humanitarian'];
const SILVER_AWARDS = ['Allied Health', 'Community', 'Legislative', 'Tribute', 'Media', 'Volunteer'];

interface Props {
  form: Form;
  tier: string | null;
  onTier: (t: string | null) => void;
  items: Array<{ id: string; category: string; qty?: number }>;
  onItems: (v: Array<{ id: string; category: string; qty?: number }>) => void;
  awards: string[];
  onAwards: (a: string[]) => void;
}

interface TierOption {
  value: string;
  label: string;
  dotClass: string;
  quota: number;
}

export default function StepSponsorTier({
  form, tier, onTier, items, onItems, awards, onAwards,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const ticketConfig = useMemo(() => {
    const field = form.fields?.find(f => f.type === 'ticket');
    return field?.ticketConfig;
  }, [form]);

  const allItems: TicketItem[] = ticketConfig?.items ?? [];
  const packages = allItems.filter(it => it.itemCategory === 'package');
  const scholarships = allItems.filter(it => it.itemCategory === 'scholarship');
  const ads = allItems.filter(it => it.itemCategory === 'ad');

  const tierOptions: TierOption[] = packages.map(p => ({
    value: p.id,
    label: p.name,
    dotClass: TIER_COLORS[p.id] || 'bg-slate-400',
    quota: TIER_QUOTAS[p.id] ?? 0,
  }));

  const selected = tierOptions.find(o => o.value === tier) || null;

  const awardList = tier === 'gold' ? GOLD_AWARDS : tier === 'silver' ? SILVER_AWARDS : [];

  const toggleItem = (itemId: string, category: string) => {
    const exists = items.some(i => i.id === itemId);
    onItems(exists ? items.filter(i => i.id !== itemId) : [...items, { id: itemId, category }]);
  };

  const toggleAward = (a: string) => {
    onAwards(awards.includes(a) ? awards.filter(x => x !== a) : [...awards, a]);
  };

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-display">Sponsorship Tier</h2>

      <div ref={wrapRef} className="relative">
        <label className="block space-y-1">
          <span className="text-xs font-display font-semibold uppercase tracking-wide text-gansid-on-surface/70">
            Select a tier <span className="text-gansid-primary">*</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-full bg-white font-body text-gansid-on-surface gradient-border-input transition-all focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40"
          >
            {selected ? (
              <>
                <span className={`w-3 h-3 rounded-full ${selected.dotClass}`} />
                <span className="flex-1 text-left">{selected.label}</span>
                <span className="text-xs text-gansid-on-surface/60">
                  {selected.quota} seat{selected.quota === 1 ? '' : 's'}
                </span>
              </>
            ) : (
              <span className="flex-1 text-left text-gansid-on-surface/40">Choose a sponsorship tier…</span>
            )}
            <ChevronDown className="w-4 h-4 text-gansid-on-surface/60" />
          </button>
        </label>

        {open && tierOptions.length > 0 && (
          <div className="absolute z-20 mt-2 w-full rounded-gansid-md bg-white shadow-lg border border-gansid-on-surface/10 overflow-hidden">
            {tierOptions.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onTier(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  tier === opt.value ? 'bg-gansid-primary/5' : 'hover:bg-gansid-on-surface/5'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${opt.dotClass}`} />
                <span className="flex-1">{opt.label}</span>
                <span className="text-xs text-gansid-on-surface/60">
                  {opt.quota} seat{opt.quota === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {awardList.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-display font-semibold">Award Categories (choose any applicable)</h3>
          <div className="flex flex-wrap gap-2">
            {awardList.map(a => (
              <label
                key={a}
                className={`inline-flex items-center gap-2 px-3 py-2 border rounded-full cursor-pointer font-body text-sm transition-colors ${
                  awards.includes(a)
                    ? 'border-gansid-primary bg-gansid-primary/5'
                    : 'border-gansid-on-surface/20 hover:border-gansid-primary/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={awards.includes(a)}
                  onChange={() => toggleAward(a)}
                />
                <span>{a}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {(scholarships.length > 0 || ads.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-display font-semibold">Optional add-ons</h3>
          <div className="space-y-1.5">
            {[...scholarships, ...ads].map(it => (
              <label key={it.id} className="flex items-center gap-2 font-body text-sm">
                <input
                  type="checkbox"
                  checked={items.some(i => i.id === it.id)}
                  onChange={() => toggleItem(it.id, it.itemCategory || 'ad')}
                />
                <span>{it.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
