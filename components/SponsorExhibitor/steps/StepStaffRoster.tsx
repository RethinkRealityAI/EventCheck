import React from 'react';
import { Plus, X } from 'lucide-react';
import type { FormField } from '../../../types';
import { getBoothType } from '../../../config/formTemplates/boothTypes';
import { getSponsorTier } from '../../../config/formTemplates/sponsorTiers';
import type { StaffEntry, StaffCategory, CategoryQuota } from '../validation';
import { GlassInput } from '../../Portal/ui/GlassInput';
import GuestFullDetailsInline from '../../Group/GuestFullDetailsInline';

interface Props {
  /** Fields from the companion STAFF form (e.g. gansid-congress-2026) — drives
   *  the inline "Full Details" accordion. The combined form itself has no fields. */
  staffFormFields: FormField[];
  registrationType: 'sponsor' | 'exhibitor';
  sponsorTier: string | null;
  boothType: string | null;
  hasAllDetails: boolean;
  onHasAllDetails: (v: boolean) => void;
  staff: StaffEntry[];
  onStaff: (s: StaffEntry[]) => void;
}

function resolveQuota(
  registrationType: 'sponsor' | 'exhibitor',
  sponsorTier: string | null,
  boothType: string | null,
): CategoryQuota | null {
  if (registrationType === 'sponsor' && sponsorTier) {
    const t = getSponsorTier(sponsorTier);
    return t ? { hall_only: t.hallOnlyQuota, full_access: t.fullCongressQuota } : null;
  }
  if (registrationType === 'exhibitor' && boothType) {
    const b = getBoothType(boothType);
    return b ? { hall_only: b.hallOnlyQuota, full_access: b.fullAccessQuota } : null;
  }
  return null;
}

export default function StepStaffRoster({
  staffFormFields, registrationType, sponsorTier, boothType,
  hasAllDetails, onHasAllDetails, staff, onStaff,
}: Props) {
  const quota = resolveQuota(registrationType, sponsorTier, boothType);

  const countInCategory = (c: StaffCategory) => staff.filter(s => s.category === c).length;

  const canAdd = (c: StaffCategory) => {
    if (!quota) return false;
    return countInCategory(c) < quota[c];
  };

  const add = (c: StaffCategory) => {
    if (!canAdd(c)) return;
    onStaff([...staff, { name: '', email: '', category: c }]);
  };

  const update = (i: number, patch: Partial<StaffEntry>) => {
    onStaff(staff.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const remove = (i: number) => onStaff(staff.filter((_, idx) => idx !== i));

  const renderRow = (s: StaffEntry, i: number) => (
    <div key={i} className="space-y-2 p-3 rounded-gansid-md border border-gansid-on-surface/10 bg-white/40">
      <div className="flex gap-2 items-end">
        <label className="flex-1 block space-y-1">
          <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">Name</span>
          <GlassInput value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
        </label>
        <label className="flex-1 block space-y-1">
          <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">Email</span>
          <GlassInput type="email" value={s.email} onChange={(e) => update(i, { email: e.target.value })} />
        </label>
        <button
          type="button"
          onClick={() => remove(i)}
          className="p-2 mb-1 text-gansid-primary hover:bg-gansid-primary/10 rounded"
          aria-label="Remove"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {hasAllDetails && staffFormFields.length > 0 && (
        <GuestFullDetailsInline
          formFields={staffFormFields}
          fullAnswers={s.fullAnswers as Record<string, any> || {}}
          onChange={(a) => update(i, { fullAnswers: a })}
          heading="Full details (dietary, emergency contact, consents, etc.)"
          rowKey={i}
        />
      )}
      {hasAllDetails && staffFormFields.length === 0 && (
        <p className="text-xs text-gansid-on-surface/60 italic">
          Full-details form is still loading — you can fill these in once it appears,
          or uncheck the "details on hand" toggle and let the staff member complete
          their own registration via email.
        </p>
      )}
    </div>
  );

  const header = (label: string, used: number, cap: number) => (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-display font-semibold">{label}</h3>
      <span className="text-xs text-gansid-on-surface/60 font-body">
        {used} of {cap} slots used
      </span>
    </div>
  );

  // Keep the true `staff` index when filtering per category so updates target the right row.
  const rowsByCategory = (c: StaffCategory): Array<[StaffEntry, number]> =>
    staff
      .map((s, i): [StaffEntry, number] => [s, i])
      .filter(([s]) => s.category === c);

  if (!quota) {
    return (
      <section>
        <h2 className="text-lg font-display mb-2">Staff Roster</h2>
        <p className="text-sm text-gansid-on-surface/70 font-body">
          {registrationType === 'sponsor'
            ? 'Pick a sponsorship tier first — staff quotas depend on it.'
            : 'Pick a booth type first — staff quotas depend on it.'}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-display">Staff Roster</h2>
        <p className="text-sm text-gansid-on-surface/70 font-body mt-0.5">
          Add the staff members attending on your organization's behalf. Each tier
          includes complimentary Hall-Only and Full Congress registrations.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm p-3 rounded-gansid-md bg-gansid-secondary/5 font-body">
        <input
          type="checkbox"
          className="mt-1"
          checked={hasAllDetails}
          onChange={(e) => onHasAllDetails(e.target.checked)}
        />
        <span>
          <strong>Yes — I have each person's details on hand.</strong> Expand each row
          to fill in dietary, emergency contact, consents, etc. Otherwise each staff
          member receives an email invitation to complete their own details.
        </span>
      </label>

      <div>
        {header('Hall-Only staff', countInCategory('hall_only'), quota.hall_only)}
        <div className="space-y-3">
          {rowsByCategory('hall_only').map(([s, i]) => renderRow(s, i))}
        </div>
        <button
          type="button"
          disabled={!canAdd('hall_only')}
          onClick={() => add('hall_only')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30 font-display font-semibold"
        >
          <Plus className="w-4 h-4" /> Add Hall-Only staff
        </button>
      </div>

      <div>
        {header('Full Congress staff', countInCategory('full_access'), quota.full_access)}
        <div className="space-y-3">
          {rowsByCategory('full_access').map(([s, i]) => renderRow(s, i))}
        </div>
        <button
          type="button"
          disabled={!canAdd('full_access')}
          onClick={() => add('full_access')}
          className="mt-3 inline-flex items-center gap-1 text-sm text-gansid-secondary disabled:text-gansid-on-surface/30 font-display font-semibold"
        >
          <Plus className="w-4 h-4" /> Add Full Congress staff
        </button>
      </div>
    </section>
  );
}
