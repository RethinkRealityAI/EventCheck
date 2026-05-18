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
  /**
   * When true, the organization name + contact name fields render as
   * confirmation labels (with a small "edit" toggle) rather than blank
   * inputs. We use this for users who arrived from the dedicated sponsor/
   * exhibitor signup, since we already captured their name + org during
   * account creation — re-asking would be friction for no benefit. The
   * email field is always read-only in this mode (it's the auth account
   * email).
   */
  prefilledFromAccount?: boolean;
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

export default function StepOrgInfo({ value, onChange, prefilledFromAccount }: Props) {
  const set = (k: keyof OrgFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  const [editingPrefilled, setEditingPrefilled] = React.useState(false);
  const showPrefilledSummary = prefilledFromAccount && !editingPrefilled;

  return (
    <section>
      <h2 className="text-lg font-display mb-3">Organization / Company Information</h2>

      {showPrefilledSummary && (
        <div className="mb-4 p-3 rounded-gansid-md bg-gansid-secondary/5 border border-gansid-secondary/15 flex items-start justify-between gap-3">
          <div className="text-sm font-body text-gansid-on-surface/85 min-w-0">
            <div>
              <span className="font-semibold">{value.orgName || '—'}</span>
              <span className="text-gansid-on-surface/50"> · </span>
              <span>{value.contactName || '—'}</span>
            </div>
            <div className="text-xs text-gansid-on-surface/60 break-all">{value.email}</div>
            <p className="mt-1 text-[11px] text-gansid-on-surface/55">
              From your account. Add a few extra details below — phone, mailing address, etc.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingPrefilled(true)}
            className="text-xs font-display font-semibold text-gansid-secondary hover:underline shrink-0"
          >
            Edit
          </button>
        </div>
      )}

      {/* Dense 12-column grid so inputs fill horizontal space instead of stacking
          vertically. Reduces the scroll-down required to see all fields on this step. */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
        {!showPrefilledSummary && (
          <>
            <FieldLabel label="Organization / Company Name" required className="md:col-span-7">
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
          </>
        )}

        {showPrefilledSummary && (
          <>
            <FieldLabel label="Website" className="md:col-span-6">
              <GlassInput type="url" value={value.website} onChange={set('website')} placeholder="https://" />
            </FieldLabel>
            <FieldLabel label="Contact Title" className="md:col-span-6">
              <GlassInput value={value.contactTitle} onChange={set('contactTitle')} placeholder="e.g. Marketing Director" />
            </FieldLabel>
            <FieldLabel label="Contact Phone" className="md:col-span-6">
              <GlassInput type="tel" value={value.phone} onChange={set('phone')} />
            </FieldLabel>
            <FieldLabel label="Mailing Address" className="md:col-span-6">
              <GlassInput value={value.address} onChange={set('address')} />
            </FieldLabel>
          </>
        )}

        {!showPrefilledSummary && (
          <FieldLabel label="Mailing Address" className="md:col-span-12">
            <GlassInput value={value.address} onChange={set('address')} />
          </FieldLabel>
        )}
      </div>
    </section>
  );
}
