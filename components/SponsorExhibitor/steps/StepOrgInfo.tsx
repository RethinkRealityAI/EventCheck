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

function FieldLabel({
  label,
  required,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">
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
    <section>
      <h2 className="text-lg font-display mb-3">Organization Information</h2>

      {/* Dense 12-column grid so inputs fill horizontal space instead of stacking
          vertically. Reduces the scroll-down required to see all fields on this step. */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
        <FieldLabel label="Organization Name" required className="md:col-span-7">
          <GlassInput value={value.orgName} onChange={set('orgName')} required />
        </FieldLabel>
        <FieldLabel label="Website" className="md:col-span-5">
          <GlassInput type="url" value={value.website} onChange={set('website')} placeholder="https://" />
        </FieldLabel>

        <FieldLabel label="Contact Name" required className="md:col-span-6">
          <GlassInput value={value.contactName} onChange={set('contactName')} required />
        </FieldLabel>
        <FieldLabel label="Contact Title" className="md:col-span-6">
          <GlassInput value={value.contactTitle} onChange={set('contactTitle')} />
        </FieldLabel>

        <FieldLabel label="Contact Email" required className="md:col-span-7">
          <GlassInput type="email" value={value.email} onChange={set('email')} required />
        </FieldLabel>
        <FieldLabel label="Contact Phone" className="md:col-span-5">
          <GlassInput type="tel" value={value.phone} onChange={set('phone')} />
        </FieldLabel>

        <FieldLabel label="Mailing Address" className="md:col-span-12">
          <GlassInput value={value.address} onChange={set('address')} />
        </FieldLabel>
      </div>
    </section>
  );
}
