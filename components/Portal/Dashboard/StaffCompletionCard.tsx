import React from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { Attendee } from '../../../types';

interface Props {
  /** The signed-in user's own unfinished staff row. */
  row: Attendee;
  /** Organisation that registered them, for the copy. */
  orgName?: string;
}

/**
 * Route a signed-in staff member into their claim form.
 *
 * WHY THIS EXISTS
 * The claim experience was reachable ONLY by clicking the emailed `?ref=` link
 * — `RegisterModal` never passes a ref. A staff member who instead signed up
 * on the portal hit a dead end: their row is `payment_status='paid'` (the org
 * was invoiced externally), so `AvailableFormsGrid` counted the form as
 * completed, removed it, and the dashboard displayed "You're all registered —
 * nothing left on your list." Their details were never collected, and the row
 * stayed pending until someone captured it at the door scanner.
 *
 * A plain link is deliberate: it hands them the exact same `?ref=` URL the
 * email contains, so both paths converge on one code path rather than a second
 * near-identical one that can drift.
 */
export const StaffCompletionCard: React.FC<Props> = ({ row, orgName }) => {
  const href = `${window.location.origin}/#/form/${row.formId}?ref=${row.id}`;

  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-amber-900">
            One more step to finish your registration
          </h3>
          <p className="mt-1 font-body text-sm text-amber-900/80">
            {orgName
              ? <>You&rsquo;ve been registered for the Congress by <strong>{orgName}</strong>.</>
              : <>You&rsquo;ve been registered for the Congress by your organisation.</>}
            {' '}There&rsquo;s nothing to pay &mdash; we just need a few details from you so we can issue your ticket.
          </p>
          <a
            href={href}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 font-body text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Complete my details
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
};
