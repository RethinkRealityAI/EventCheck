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
    <section className="space-y-5">
      <h2 className="text-xl font-display">Booth Type</h2>

      <label className="block space-y-1">
        <span className="text-xs font-display font-semibold uppercase tracking-wide text-gansid-on-surface/70">
          Select your booth <span className="text-gansid-primary">*</span>
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
        <div className="p-4 rounded-gansid-md bg-gansid-secondary/5 border border-gansid-secondary/20 text-sm space-y-1 font-body">
          <div>
            <strong>Price:</strong> {booth.priceDisplay} {booth.currency}{' '}
            <span className="text-gansid-on-surface/50">(paid externally)</span>
          </div>
          <div>
            <strong>Included registrations:</strong>{' '}
            {booth.hallOnlyQuota} Hall-Only + {booth.fullAccessQuota} Full-Access
          </div>
          {booth.note && (
            <div className="text-gansid-primary text-xs mt-2">{booth.note}</div>
          )}
        </div>
      )}
    </section>
  );
}
