// Attendee identity rules for a system where EMAIL IS NOT A UNIQUE KEY.
//
// `attendees.id` is the only identity. `attendees.email` is deliberately
// non-unique (no unique index exists on either tenant): real registrants share
// an inbox — a spouse/partner/colleague registering someone who has no address
// of their own, an assistant registering a delegation, a household with one
// account. Every read/resend path must therefore key on the attendee ID.
//
// The one place email was still (implicitly) treated as identity was the
// imported-contact dedupe: "an attendee already exists for this form+email →
// link this contact to it and resend." With a shared address that hands
// contact B the ticket belonging to person A — wrong name, wrong QR, wrong
// answers. This module decides when reusing an existing row is legitimate.
//
// Pure functions only — no Deno/Supabase imports — so the repo's Vitest suite
// covers them (CLAUDE.md §16 rule #14).

/** Loose name comparison: case/whitespace/punctuation-insensitive. */
export function normalizePersonName(name: unknown): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True when two names plausibly refer to the same person. Deliberately loose
 * (an exact-match rule would mint duplicate tickets for "Dr. Jane Doe" vs
 * "Jane Doe") but never treats two different people as one: one name must
 * contain the whole of the other, token-wise.
 */
export function namesLookLikeSamePerson(a: unknown, b: unknown): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every(tok => long.includes(tok));
}

export interface AttendeeCandidate {
  id: string;
  name?: string | null;
  email?: string | null;
}

export interface PickAttendeeOptions {
  /** Name on the imported contact we're issuing/claiming for. */
  contactName?: string | null;
  /** Rows already matched on form_id + email (case-insensitive). */
  candidates: AttendeeCandidate[];
  /**
   * Attendee ids already claimed by some OTHER imported contact. Those belong
   * to a different person by definition — never reuse them.
   */
  claimedByOtherContact?: Iterable<string>;
}

export type PickAttendeeResult =
  /** Reuse this row — it is (very likely) the same person. */
  | { action: 'reuse'; attendeeId: string; reason: 'name-match' | 'sole-unclaimed' }
  /** Mint a fresh row — the address is shared with someone else. */
  | { action: 'create'; reason: 'no-candidates' | 'all-claimed' | 'different-person' };

/**
 * Decide whether an existing same-email attendee row may be reused for this
 * contact, or whether a new row must be created because the address is shared.
 *
 * Order matters: a name match wins even when several rows share the address,
 * so re-inviting an already-registered person still de-duplicates correctly.
 */
export function pickAttendeeForContact(opts: PickAttendeeOptions): PickAttendeeResult {
  const claimed = new Set<string>(opts.claimedByOtherContact ?? []);
  const candidates = (opts.candidates ?? []).filter(c => c && typeof c.id === 'string' && c.id);

  if (candidates.length === 0) return { action: 'create', reason: 'no-candidates' };

  const unclaimed = candidates.filter(c => !claimed.has(c.id));
  if (unclaimed.length === 0) return { action: 'create', reason: 'all-claimed' };

  const named = unclaimed.find(c => namesLookLikeSamePerson(c.name, opts.contactName));
  if (named) return { action: 'reuse', attendeeId: named.id, reason: 'name-match' };

  // No name agreement. Reuse ONLY when the address is unambiguous — a single
  // unclaimed row and no contact name to contradict it. Otherwise the address
  // is shared (or the names genuinely differ) and this contact needs their own
  // ticket, keyed by its own attendee id.
  const contactName = normalizePersonName(opts.contactName);
  if (unclaimed.length === 1 && !contactName) {
    return { action: 'reuse', attendeeId: unclaimed[0].id, reason: 'sole-unclaimed' };
  }

  return { action: 'create', reason: 'different-person' };
}
