import React from 'react';
import { getBoothType } from '../../../config/formTemplates/boothTypes';
import { getSponsorTier } from '../../../config/formTemplates/sponsorTiers';
import type { ExtraStaffEntry, StaffEntry } from '../validation';
import { EXTRA_STAFF_UNIT_PRICE_USD } from '../validation';

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
  extras: ExtraStaffEntry[];
  hasAllDetails: boolean;
  error: string | null;
}

export default function StepReview(p: Props) {
  const booth = p.boothType ? getBoothType(p.boothType) : null;
  const tier = p.sponsorTier ? getSponsorTier(p.sponsorTier) : null;
  const filled = p.staff.filter(s => s.name.trim() && s.email.trim()).length;
  const hallOnly = p.staff.filter(s => s.category === 'hall_only').length;
  const fullAccess = p.staff.filter(s => s.category === 'full_access').length;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-display">Review</h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-body">
        <dt className="font-semibold">Type</dt>
        <dd className="capitalize">{p.registrationType}</dd>

        <dt className="font-semibold">Organization</dt>
        <dd>{p.org.orgName}</dd>

        <dt className="font-semibold">Contact</dt>
        <dd>
          {p.org.contactName} &lt;{p.org.email}&gt;
        </dd>

        {tier && (
          <>
            <dt className="font-semibold">Tier</dt>
            <dd>
              {tier.name} — {tier.hallOnlyQuota} Hall-Only + {tier.fullCongressQuota} Full Congress
            </dd>
          </>
        )}

        {booth && (
          <>
            <dt className="font-semibold">Booth</dt>
            <dd>
              {booth.label} — {booth.hallOnlyQuota} Hall-Only + {booth.fullAccessQuota} Full Congress
            </dd>
          </>
        )}

        <dt className="font-semibold">Staff</dt>
        <dd>
          {hallOnly} Hall-Only + {fullAccess} Full Congress · {filled} of {p.staff.length} rows filled
          ({p.hasAllDetails ? 'inline details' : 'send invitation links'})
        </dd>

        {p.extras.length > 0 && (
          <>
            <dt className="font-semibold">Extras</dt>
            <dd>
              {p.extras.length} × ${EXTRA_STAFF_UNIT_PRICE_USD} USD = <strong>${p.extras.length * EXTRA_STAFF_UNIT_PRICE_USD} USD</strong> (payable online by card)
            </dd>
          </>
        )}
      </dl>

      {p.error && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-900 font-body">
          {p.error}
        </div>
      )}

      <p className="text-xs text-gansid-on-surface/60 font-body">
        {p.extras.length > 0
          ? <>Click <strong>Pay &amp; Submit</strong> below to be redirected to a secure payment page. Your registration completes automatically after payment.</>
          : <>Click <strong>Submit Registration</strong> below to finalize. Your staff will receive their invitation emails immediately after submission.</>}
      </p>
    </section>
  );
}
