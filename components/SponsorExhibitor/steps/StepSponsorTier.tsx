import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SPONSOR_TIERS, getSponsorTier } from '../../../config/formTemplates/sponsorTiers';

interface Props {
  tier: string | null;
  onTier: (t: string | null) => void;
}

export default function StepSponsorTier({ tier, onTier }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const selected = tier ? getSponsorTier(tier) : null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-display">Sponsorship Tier</h2>
        <p className="text-sm text-gansid-on-surface/70 font-body mt-0.5">
          Confirm the tier you've committed to. Each tier includes a set number of
          complimentary Hall-Only and Full Congress staff registrations.
        </p>
      </div>

      <div ref={wrapRef} className="relative">
        <label className="block space-y-1">
          <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">
            Tier <span className="text-gansid-primary">*</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-full bg-white font-body text-gansid-on-surface gradient-border-input transition-all focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40"
          >
            {selected ? (
              <>
                <span className={`w-3 h-3 rounded-full ${selected.colorClass}`} />
                <span className="flex-1 text-left">{selected.name}</span>
                <span className="text-xs text-gansid-on-surface/60">
                  {selected.hallOnlyQuota} + {selected.fullCongressQuota} seats
                </span>
              </>
            ) : (
              <span className="flex-1 text-left text-gansid-on-surface/40">Choose your tier…</span>
            )}
            <ChevronDown className="w-4 h-4 text-gansid-on-surface/60" />
          </button>
        </label>

        {open && (
          <div className="absolute z-20 mt-2 w-full rounded-gansid-md bg-white shadow-lg border border-gansid-on-surface/10 overflow-hidden">
            {SPONSOR_TIERS.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onTier(opt.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                  tier === opt.id ? 'bg-gansid-primary/5' : 'hover:bg-gansid-on-surface/5'
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${opt.colorClass}`} />
                <span className="flex-1 font-display font-semibold">{opt.name}</span>
                <span className="text-xs text-gansid-on-surface/60">
                  {opt.hallOnlyQuota} Hall-Only + {opt.fullCongressQuota} Full Congress
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="p-4 rounded-gansid-md bg-gansid-primary/5 border border-gansid-primary/20 text-sm font-body space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${selected.colorClass}`} />
            <strong className="font-display">{selected.name}</strong>
            <span className="text-gansid-on-surface/50">— included registrations</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg bg-white/60 border border-gansid-on-surface/10 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gansid-on-surface/60">Hall-Only</div>
              <div className="font-display font-bold text-xl text-gansid-primary">{selected.hallOnlyQuota}</div>
            </div>
            <div className="rounded-lg bg-white/60 border border-gansid-on-surface/10 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gansid-on-surface/60">Full Congress</div>
              <div className="font-display font-bold text-xl text-gansid-secondary">{selected.fullCongressQuota}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
