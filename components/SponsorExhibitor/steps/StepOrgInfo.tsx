import React from 'react';
import { GlassInput } from '../../Portal/ui/GlassInput';

type OrgFields = {
  orgName: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};

interface Props {
  value: OrgFields;
  onChange: (v: OrgFields) => void;
}

function FieldLabel({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-display font-semibold uppercase tracking-wide text-gansid-on-surface/70">
        {label} {required && <span className="text-gansid-primary">*</span>}
      </span>
      {children}
    </label>
  );
}

export default function StepOrgInfo({ value, onChange }: Props) {
  const set = (k: keyof OrgFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-display">Organization Information</h2>

      <FieldLabel label="Organization Name" required>
        <GlassInput value={value.orgName} onChange={set('orgName')} required />
      </FieldLabel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldLabel label="Contact Name" required>
          <GlassInput value={value.contactName} onChange={set('contactName')} required />
        </FieldLabel>
        <FieldLabel label="Contact Title">
          <GlassInput value={value.contactTitle} onChange={set('contactTitle')} />
        </FieldLabel>
        <FieldLabel label="Contact Email" required>
          <GlassInput type="email" value={value.email} onChange={set('email')} required />
        </FieldLabel>
        <FieldLabel label="Contact Phone">
          <GlassInput type="tel" value={value.phone} onChange={set('phone')} />
        </FieldLabel>
      </div>

      <FieldLabel label="Mailing Address">
        <GlassInput value={value.address} onChange={set('address')} />
      </FieldLabel>

      <FieldLabel label="Website">
        <GlassInput type="url" value={value.website} onChange={set('website')} />
      </FieldLabel>
    </section>
  );
}
