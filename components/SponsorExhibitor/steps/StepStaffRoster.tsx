import React from 'react';
import { Plus, X } from 'lucide-react';
import type { Form } from '../../../types';
import { getBoothType } from '../../../config/formTemplates/boothTypes';
import { getSponsorQuota, type StaffEntry, type StaffCategory, type SponsorTier } from '../validation';
import { GlassInput } from '../../Portal/ui/GlassInput';
import GuestFullDetailsInline from '../../Group/GuestFullDetailsInline';

interface Props {
  form: Form;
  registrationType: 'sponsor' | 'exhibitor';
  sponsorTier: string | null;
  boothType: string | null;
  hasAllDetails: boolean;
  onHasAllDetails: (v: boolean) => void;
  staff: StaffEntry[];
  onStaff: (s: StaffEntry[]) => void;
}

export default function StepStaffRoster({
  form, registrationType, sponsorTier, boothType,
  hasAllDetails, onHasAllDetails, staff, onStaff,
}: Props) {
  const booth = boothType ? getBoothType(boothType) : null;
  const sponsorQuota = sponsorTier ? getSponsorQuota(sponsorTier as SponsorTier) : 0;
  const formFields = form.fields ?? [];

  const countInCategory = (c: StaffCategory) => staff.filter(s => s.category === c).length;

  const canAdd = (c: StaffCategory) => {
    if (registrationType === 'sponsor') {
      return c === 'sponsor_seat' && countInCategory('sponsor_seat') < sponsorQuota;
    }
    if (!booth) return false;
    if (c === 'hall_only') return countInCategory('hall_only') < booth.hallOnlyQuota;
    if (c === 'full_access') return countInCategory('full_access') < booth.fullAccessQuota;
    return false;
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
          <span className="text-xs font-display font-semibold uppercase tracking-wide text-gansid-on-surface/70">Name</span>
          <GlassInput value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
        </label>
        <label className="flex-1 block space-y-1">
          <span className="text-xs font-display font-semibold uppercase tracking-wide text-gansid-on-surface/70">Email</span>
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
      {hasAllDetails && (
        <GuestFullDetailsInline
          formFields={formFields}
          fullAnswers={s.fullAnswers as Record<string, any> || {}}
          onChange={(a) => update(i, { fullAnswers: a })}
          heading="Full details"
          rowKey={i}
        />
      )}
    </div>
  );

  const header = (label: string, used: number, quota: number) => (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-display font-semibold">{label}</h3>
      <span className="text-xs text-gansid-on-surface/60 font-body">
        {used} of {quota} slots used
      </span>
    </div>
  );

  // Build indexed lists per category so we keep the true `staff` index when rendering.
  const rowsByCategory = (c: StaffCategory): Array<[StaffEntry, number]> =>
    staff
      .map((s, i): [StaffEntry, number] => [s, i])
      .filter(([s]) => s.category === c);

  return (
    <section className="space-y-5">
      <h2 className="text-xl font-display">Staff Roster</h2>

      <label className="flex items-start gap-2 text-sm p-3 rounded-gansid-md bg-gansid-secondary/5 font-body">
        <input
          type="checkbox"
          className="mt-1"
          checked={hasAllDetails}
          onChange={(e) => onHasAllDetails(e.target.checked)}
        />
        <span>
          <strong>Yes — I have each person's details on hand.</strong> I'll fill in all personal
          fields (dietary, emergency, etc.) now. Otherwise each staff member receives an
          invitation email to complete their own details.
        </span>
      </label>

      {registrationType === 'sponsor' && (
        <div>
          {header('Sponsor Seats', countInCategory('sponsor_seat'), sponsorQuota)}
          <div className="space-y-3">
            {rowsByCategory('sponsor_seat').map(([s, i]) => renderRow(s, i))}
          </div>
          <button
            type="button"
            disabled={!canAdd('sponsor_seat')}
            onClick={() => add('sponsor_seat')}
            className="mt-3 inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30 font-display font-semibold"
          >
            <Plus className="w-4 h-4" /> Add staff member
          </button>
        </div>
      )}

      {registrationType === 'exhibitor' && booth && (
        <>
          <div>
            {header('Hall-Only staff', countInCategory('hall_only'), booth.hallOnlyQuota)}
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
            {header('Full-Access staff', countInCategory('full_access'), booth.fullAccessQuota)}
            <div className="space-y-3">
              {rowsByCategory('full_access').map(([s, i]) => renderRow(s, i))}
            </div>
            <button
              type="button"
              disabled={!canAdd('full_access')}
              onClick={() => add('full_access')}
              className="mt-3 inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30 font-display font-semibold"
            >
              <Plus className="w-4 h-4" /> Add Full-Access staff
            </button>
          </div>
        </>
      )}

      {registrationType === 'exhibitor' && !booth && (
        <p className="text-sm text-gansid-on-surface/70 font-body">
          Pick a booth type first — quotas depend on it.
        </p>
      )}
    </section>
  );
}
