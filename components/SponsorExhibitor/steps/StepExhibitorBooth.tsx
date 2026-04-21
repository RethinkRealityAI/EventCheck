import React from 'react';
import { GlassSelect } from '../../Portal/ui/GlassSelect';
import { EXHIBITOR_BOOTH_TYPES, getBoothType } from '../../../config/formTemplates/boothTypes';

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
}

export default function StepExhibitorBooth({ value, onChange }: Props) {
  const booth = value ? getBoothType(value) : null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-display">Booth Type</h2>
        <p className="text-sm text-gansid-on-surface/70 font-body mt-0.5">
          Select the booth type you purchased. Your booth determines the number of
          complimentary Hall-Only and Full Congress staff registrations included.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">
          Booth type <span className="text-gansid-primary">*</span>
        </span>
        <GlassSelect
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          required
        >
          <option value="">Choose a booth type…</option>
          {EXHIBITOR_BOOTH_TYPES.map(b => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </GlassSelect>
      </label>

      {booth && (
        <div className="p-4 rounded-gansid-md bg-gansid-secondary/5 border border-gansid-secondary/20 font-body space-y-1.5">
          <div className="text-sm">
            <strong>Price:</strong> {booth.priceDisplay} {booth.currency}{' '}
            <span className="text-gansid-on-surface/50">(paid externally)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg bg-white/60 border border-gansid-on-surface/10 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gansid-on-surface/60">Hall-Only</div>
              <div className="font-display font-bold text-xl text-gansid-primary">{booth.hallOnlyQuota}</div>
            </div>
            <div className="rounded-lg bg-white/60 border border-gansid-on-surface/10 px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-gansid-on-surface/60">Full Congress</div>
              <div className="font-display font-bold text-xl text-gansid-secondary">{booth.fullAccessQuota}</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
