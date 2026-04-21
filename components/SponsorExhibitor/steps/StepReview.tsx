import React from 'react';
import { ViscousButton } from '../../Portal/ui/ViscousButton';
import { getBoothType } from '../../../config/formTemplates/boothTypes';
import { getSponsorQuota, type StaffEntry, type SponsorTier } from '../validation';

interface Props {
  registrationType: 'sponsor' | 'exhibitor';
  org: {
    orgName: string;
    contactName: string;
    contactTitle?: string;
    email: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  sponsorTier: string | null;
  boothType: string | null;
  staff: StaffEntry[];
  hasAllDetails: boolean;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

export default function StepReview(p: Props) {
  const booth = p.boothType ? getBoothType(p.boothType) : null;
  const sponsorQuota = p.sponsorTier ? getSponsorQuota(p.sponsorTier as SponsorTier) : 0;
  const filled = p.staff.filter(s => s.name.trim() && s.email.trim()).length;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-display">Review</h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-body">
        <dt className="font-semibold">Type</dt>
        <dd className="capitalize">{p.registrationType}</dd>

        <dt className="font-semibold">Organization</dt>
        <dd>{p.org.orgName}</dd>

        <dt className="font-semibold">Contact</dt>
        <dd>
          {p.org.contactName} &lt;{p.org.email}&gt;
        </dd>

        {p.sponsorTier && (
          <>
            <dt className="font-semibold">Tier</dt>
            <dd className="capitalize">
              {p.sponsorTier}{sponsorQuota > 0 ? ` (${sponsorQuota} seats)` : ''}
            </dd>
          </>
        )}

        {booth && (
          <>
            <dt className="font-semibold">Booth</dt>
            <dd>
              {booth.label} — {booth.hallOnlyQuota} Hall-Only + {booth.fullAccessQuota} Full-Access
            </dd>
          </>
        )}

        <dt className="font-semibold">Staff</dt>
        <dd>
          {filled} of {p.staff.length} filled{' '}
          ({p.hasAllDetails ? 'inline details' : 'send invitation links'})
        </dd>
      </dl>

      {p.error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-900 font-body">
          {p.error}
        </div>
      )}

      <ViscousButton variant="primary" onClick={p.onSubmit} disabled={p.submitting}>
        {p.submitting ? 'Submitting…' : 'Submit Registration'}
      </ViscousButton>
    </section>
  );
}
