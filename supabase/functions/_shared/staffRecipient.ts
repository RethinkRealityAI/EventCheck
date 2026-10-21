// Who a staff email may go to.
//
// staff-invite and staff-claim-completed used to take `to` from the request
// and send to it. send-ticket-email is gateway-open, so anyone could have a
// branded invite — or a staff member's real ticket, QR and download link —
// delivered to an address they chose. Both modes now send only to the address
// already on the staff row, the same rule every other open mode follows
// (_shared/senderAuth.ts header). A caller's `to` is accepted only as a
// consistency check against that row.
//
// Pure: no I/O, unit-tested in tests/staffRecipient.test.ts.

import { isPlaceholderEmail } from './companionIdentity.ts';

const norm = (e: unknown) => String(e ?? '').trim().toLowerCase();

/**
 * The staff row id from a claim link (`…/#/form/<formId>?ref=<id>`), or ''.
 * The Portal dashboard's fill-in send predates `attendeeId` and only carries
 * the id inside its completeUrl.
 */
export function refFromClaimUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const m = /[?&]ref=([^&#\s]+)/.exec(url);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return '';
  }
}

export type StaffRecipient =
  | { ok: true; to: string }
  | { ok: false; reason: 'no-email' | 'mismatch' };

/**
 * The row's own address; `callerTo`, when given, must match it (any case).
 * A placeholder seat has no address yet and gets nothing.
 */
export function resolveStaffRecipient(rowEmail: unknown, callerTo: unknown): StaffRecipient {
  const own = String(rowEmail ?? '').trim();
  if (!own || isPlaceholderEmail(own)) return { ok: false, reason: 'no-email' };
  if (norm(callerTo) && norm(callerTo) !== norm(own)) return { ok: false, reason: 'mismatch' };
  return { ok: true, to: own };
}
