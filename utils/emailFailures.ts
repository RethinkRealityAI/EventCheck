// Turning the `email_failures` table into something an admin can act on.
//
// The table records WHY a send failed. This module answers the two questions an
// admin actually has: "who didn't get their email?" and "can I just resend it?"
//
// Pure — no Supabase, no React — so the retry rules are unit-testable. Getting
// them wrong in either direction is costly: offering retry on a send we cannot
// reconstruct produces a button that always fails, and NOT offering it on one
// we can leaves an attendee without a ticket.

export interface EmailFailureRecord {
  id: string;
  occurredAt: string;
  mode: string | null;
  templateKey: string | null;
  recipient: string | null;
  formId: string | null;
  attendeeId: string | null;
  kind: string | null;
  message: string | null;
  subject: string | null;
  resolvedAt: string | null;
}

/**
 * Modes the SERVER can rebuild from an attendee id alone.
 *
 * These fetch the row, the form and the settings themselves, so a retry needs
 * nothing but the id — which the failure row carries. Anything not listed here
 * needs content we deliberately do NOT store (see `raw-html` below).
 */
const RETRYABLE_BY_ATTENDEE_ID: ReadonlySet<string> = new Set([
  'guest-claim-completed',
  'staff-claim-completed',
  'exhibitor-staff-claim-completed',
  'staff-invite',
  'exhibitor-staff-invite',
  'bogo-ticket',
  'bogo-ticket-updated',
  'bogo-claim-link',
]);

/** `registration-confirmed` takes the id under a different key. */
const PRIMARY_ID_MODES: ReadonlySet<string> = new Set(['registration-confirmed']);

export type RetryPlan =
  | { kind: 'auto'; mode: string; body: Record<string, unknown> }
  | { kind: 'compose'; reason: string }
  | { kind: 'impossible'; reason: string };

/**
 * How (or whether) this failure can be retried.
 *
 * `raw-html` carries the fully-rendered admin-composed message, and we
 * deliberately never store message bodies in `email_failures` — so it cannot be
 * replayed from the record. That is not a gap to paper over with a broken
 * button: the honest answer is to reopen the composer, which still has the
 * template and the recipient.
 */
export function planRetry(f: EmailFailureRecord, origin: string): RetryPlan {
  const mode = (f.mode ?? '').trim();
  if (!mode) return { kind: 'impossible', reason: 'This failure was recorded without a send type, so it cannot be replayed automatically.' };

  if (mode === 'raw-html') {
    return {
      kind: 'compose',
      reason: 'This was a one-off message written in the composer. We do not store message bodies, so reopen the composer to send it again.',
    };
  }

  const id = (f.attendeeId ?? '').trim();
  if (!id) {
    return { kind: 'impossible', reason: 'No attendee is linked to this failure, so there is nothing to rebuild the email from.' };
  }

  if (PRIMARY_ID_MODES.has(mode)) {
    return { kind: 'auto', mode, body: { mode, primaryAttendeeId: id, origin } };
  }
  if (RETRYABLE_BY_ATTENDEE_ID.has(mode)) {
    const body: Record<string, unknown> = { mode, attendeeId: id, origin };
    // staff-claim-completed is the one mode that still needs an explicit
    // recipient — its caller historically passed pre-composed fields.
    if (mode === 'staff-claim-completed' && f.recipient) body.to = f.recipient;
    return { kind: 'auto', mode, body };
  }

  return {
    kind: 'impossible',
    reason: `We do not have a safe automatic retry for "${mode}" yet. Resend from the attendee's record instead.`,
  };
}

export interface RecipientGroup {
  recipient: string;
  /** Most recent failure for this address — what the row summarises. */
  latest: EmailFailureRecord;
  failures: EmailFailureRecord[];
  count: number;
  /** True when at least one failure for this address can be retried in one click. */
  anyRetryable: boolean;
}

/**
 * One row per PERSON, not per failure.
 *
 * A quota outage produces one row per recipient in a single run; a flapping
 * address produces many rows for one person. An admin thinks in people, so the
 * list is grouped and sorted by most-recent failure.
 */
export function groupFailuresByRecipient(
  rows: EmailFailureRecord[],
  origin = '',
): RecipientGroup[] {
  const byRecipient = new Map<string, EmailFailureRecord[]>();
  for (const r of rows) {
    const key = (r.recipient ?? '').trim().toLowerCase() || '(no address recorded)';
    const list = byRecipient.get(key);
    if (list) list.push(r); else byRecipient.set(key, [r]);
  }

  const groups: RecipientGroup[] = [];
  for (const [recipient, failures] of byRecipient) {
    const sorted = [...failures].sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || ''));
    groups.push({
      recipient,
      latest: sorted[0],
      failures: sorted,
      count: sorted.length,
      anyRetryable: sorted.some(f => planRetry(f, origin).kind === 'auto'),
    });
  }
  return groups.sort((a, b) => (b.latest.occurredAt || '').localeCompare(a.latest.occurredAt || ''));
}

/** Short, human label for a failure kind. Used on the badge/chip. */
export function failureKindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'quota': return 'Provider limit';
    case 'auth': return 'Credentials';
    case 'connection': return 'Connection';
    case 'recipient': return 'Bad address';
    case 'not-configured': return 'Not configured';
    default: return 'Failed';
  }
}

/**
 * Is retrying this worth attempting right now?
 *
 * A quota failure will fail again until the cap resets, so the UI warns rather
 * than silently burning another send against a closed door.
 */
export function retryLikelyToFailAgain(kind: string | null | undefined): boolean {
  return kind === 'quota' || kind === 'auth' || kind === 'not-configured';
}
