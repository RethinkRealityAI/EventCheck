// Client-side view of "is this registration complete, and can we ask?".
//
// The rules for WHAT is missing live in
// supabase/functions/_shared/registrationCompleteness.ts and are shared with the
// server. This file adds only WHO may be sent a completion link, mirroring the
// server's `eligibility()` in supabase/functions/registration-complete — so the
// admin never sees a "Send link" button the server will refuse.

import type { Attendee, Form } from '../types';
import {
  assessCompleteness,
  type CompletenessReport,
} from '../supabase/functions/_shared/registrationCompleteness';
import { isPendingGuest } from './registrationKind';

export type CompletionIneligibleReason = 'no-form' | 'pending-seat' | 'org-delegate' | 'org-booking';

export type CompletionStatus =
  | { eligible: false; reason: CompletionIneligibleReason }
  | { eligible: true; report: CompletenessReport };

const ORG_FORM_TYPES = new Set(['sponsor', 'exhibitor', 'sponsor_exhibitor']);

/**
 * `isDelegate` comes from the caller's registration index (utils/registrationKind),
 * which already recognises a delegate by guest_type OR by an org parent — the
 * same two tests the server applies.
 */
export function completionStatus(
  attendee: Pick<Attendee, 'answers' | 'guestType' | 'email' | 'name' | 'isPrimary' | 'primaryAttendeeId'>,
  form: Pick<Form, 'fields' | 'formType'> | undefined,
  opts: { isDelegate: boolean },
): CompletionStatus {
  if (!form) return { eligible: false, reason: 'no-form' };
  if (isPendingGuest(attendee)) return { eligible: false, reason: 'pending-seat' };
  if (opts.isDelegate) return { eligible: false, reason: 'org-delegate' };
  if (form.formType && ORG_FORM_TYPES.has(form.formType)) return { eligible: false, reason: 'org-booking' };
  return { eligible: true, report: assessCompleteness(form.fields, (attendee.answers ?? {}) as Record<string, unknown>) };
}

/** Shorthand for list filters: eligible AND missing a required answer. */
export function needsCompletion(status: CompletionStatus): boolean {
  return status.eligible && !status.report.complete;
}

/** Keys the Responses view should never render as answers. */
export function isInternalAnswerKey(key: string): boolean {
  // Leading underscore is this codebase's convention for metadata stored in
  // `answers` (_purchaser_filled, _guest_country, _qa_run, _completed_at,
  // _asked_fields). Matching the prefix, rather than listing names, is what
  // stops the next one leaking in as a "[object Object]" card.
  return key.startsWith('_');
}
