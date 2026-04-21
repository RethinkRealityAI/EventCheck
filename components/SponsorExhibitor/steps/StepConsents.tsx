import React from 'react';
import ConsentCheckbox from '../../Consent/ConsentCheckbox';

interface Props {
  value: { terms: boolean; disclaimer: boolean; photo: boolean };
  onChange: (v: { terms: boolean; disclaimer: boolean; photo: boolean }) => void;
}

export default function StepConsents({ value, onChange }: Props) {
  const set = (k: 'terms' | 'disclaimer' | 'photo') => (v: boolean) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-display">Consents</h2>

      <ConsentCheckbox
        id="se-terms"
        label="I have read and agree to the"
        linkText="Terms & Conditions"
        modalTitle="GANSID Congress 2026 — Terms & Conditions"
        modalUrl="/branding/gansid/docs/gc26-terms-conditions.md"
        checked={value.terms}
        onChange={set('terms')}
        required
      />

      <ConsentCheckbox
        id="se-disclaimer"
        label="I have read and agree to the"
        linkText="Disclaimer & Liability Waiver"
        modalTitle="GANSID Congress 2026 — Disclaimer & Limitation of Liability"
        modalUrl="/branding/gansid/docs/gc26-disclaimer.md"
        checked={value.disclaimer}
        onChange={set('disclaimer')}
        required
      />

      <label className="flex items-start gap-2 text-sm font-body">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={value.photo}
          onChange={(e) => set('photo')(e.target.checked)}
          required
        />
        <span>
          I acknowledge that photos or videos may be taken at the event for GANSID promotional purposes. <span className="text-gansid-primary">*</span>
        </span>
      </label>
    </section>
  );
}
