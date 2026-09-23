// Who, exactly, is the extra person on a TSCS India booking?
//
// A TSCS confirmation can carry two kinds of companion: paid "Additional
// Participants" and one complimentary "Free Addon Person". Their form does not
// validate either block, so what arrives is anything the buyer typed — and the
// ingest used to accept all of it. Two rows in production show what that costs:
//
//   REG-00061  "Free Addon Person / Name- -Email"     → attendee named "- -"
//              with the BUYER's inbox, sitting in the live roster.
//   REG-00058  addon email "companion@gmail.com.com" → a doubled TLD that
//              can never be delivered, stored as if it were reachable.
//
// So the decision is split in two, because they have different consequences:
//
//   NAME  decides whether this is a person at all. No usable name means there
//         is nobody to put on a badge, so the seat is booked but unclaimed —
//         `guest_type = 'pending-claim'`, the same state a group guest sits in
//         before they fill in their details, with the same claim link.
//
//   EMAIL decides only whether we can write to them DIRECTLY. A companion with
//         a real name and no address of their own is still a real registrant —
//         they belong on the roster and at check-in. Their mail simply routes
//         through the purchaser, which is what the buyer intended by leaving
//         the field blank.
//
// Both verdicts keep the raw input, because the admin who fixes a typo needs to
// see what the partner actually sent.

export interface RawCompanion {
  name?: string | null;
  email?: string | null;
}

export type NameReason = 'ok' | 'missing' | 'placeholder';
export type EmailReason = 'ok' | 'missing' | 'malformed' | 'doubled-tld' | 'same-as-purchaser';

export interface CompanionIdentity {
  /** A usable human name, or null when there is nobody to put on a badge. */
  name: string | null;
  nameReason: NameReason;
  /** The companion's OWN deliverable address, or null when there isn't one. */
  email: string | null;
  emailReason: EmailReason;
  /** Verbatim input, so an admin can see what TSCS sent and correct it. */
  rawName: string | null;
  rawEmail: string | null;
}

const HONORIFIC_RE = /^(?:mr|mrs|ms|miss|dr|prof|mx)\.?\s+/i;

/** Letters-only forms that are a person declining to answer, not a name. */
const NON_NAMES: ReadonlySet<string> = new Set([
  'na', 'nil', 'none', 'nonenone', 'nota', 'notapplicable', 'noname',
  'test', 'testtest', 'dummy', 'sample', 'unknown', 'tbd', 'tba', 'xx', 'xxx',
]);

/**
 * Is this a name we can print on a badge?
 *
 * Structural first, blocklist second. The structural rule ("at least two
 * letters") is what catches `- -`, `--`, `.` and `_ _` without any list to
 * maintain; the blocklist only adds the handful of spellings that ARE letters
 * but mean "I left this blank" (`None None`, `N/A`).
 *
 * Deliberately permissive otherwise. Gibberish is indistinguishable from a
 * name nobody on this team has seen before, and rejecting an unfamiliar
 * transliteration would keep a paying registrant off the roster — a far worse
 * error than letting one odd string through to a human's eye.
 */
export function readCompanionName(raw: string | null | undefined): { name: string | null; reason: NameReason } {
  const cleaned = (raw ?? '').replace(/\s+/g, ' ').trim().replace(HONORIFIC_RE, '').trim();
  if (!cleaned) return { name: null, reason: 'missing' };
  const letters = cleaned.toLowerCase().replace(/[^a-zÀ-ɏ]/g, '');
  if (letters.length < 2) return { name: null, reason: 'placeholder' };
  if (NON_NAMES.has(letters)) return { name: null, reason: 'placeholder' };
  // "aaa", "----x----" — one repeated character is never a name.
  if (new Set(letters).size === 1) return { name: null, reason: 'placeholder' };
  return { name: cleaned, reason: 'ok' };
}

/**
 * Is this an address we can actually deliver to, and is it THEIRS?
 *
 * `doubled-tld` exists for `gmail.com.com`: it passes every shape check and
 * every regex, resolves to nothing, and burns a send against the daily SMTP
 * quota every time it is retried. The rule matches only a final label repeated
 * verbatim (`.com.com`, `.co.co`), so real public suffixes — `.co.in`,
 * `.com.au`, `.co.uk` — are untouched.
 */
export function readCompanionEmail(
  raw: string | null | undefined,
  purchaserEmail?: string | null,
): { email: string | null; reason: EmailReason } {
  const cleaned = (raw ?? '').trim().toLowerCase();
  if (!cleaned) return { email: null, reason: 'missing' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) return { email: null, reason: 'malformed' };
  if (/\.([a-z]{2,24})\.\1$/.test(cleaned)) return { email: null, reason: 'doubled-tld' };
  if (purchaserEmail && cleaned === purchaserEmail.trim().toLowerCase()) {
    return { email: null, reason: 'same-as-purchaser' };
  }
  return { email: cleaned, reason: 'ok' };
}

export function resolveCompanionIdentity(
  companion: RawCompanion | null | undefined,
  purchaserEmail?: string | null,
): CompanionIdentity {
  const rawName = companion?.name ?? null;
  const rawEmail = companion?.email ?? null;
  const n = readCompanionName(rawName);
  const e = readCompanionEmail(rawEmail, purchaserEmail);
  return {
    name: n.name,
    nameReason: n.reason,
    email: e.email,
    emailReason: e.reason,
    rawName,
    rawEmail,
  };
}

/**
 * An address that is syntactically valid and can never be delivered to.
 * `.invalid` is reserved by RFC 2606 precisely for this, so a bug that tries
 * to mail an unclaimed seat fails at the DNS layer instead of reaching a real
 * person's inbox. Matches the placeholder ManualTicketTool already issues.
 */
export function placeholderEmailFor(attendeeId: string): string {
  return `guest-${attendeeId}@placeholder.invalid`;
}

/** Never send to one of these, whatever list it turns up in. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return /@placeholder\.invalid$/i.test((email ?? '').trim());
}

/** The name an unclaimed seat carries until its holder fills in their details. */
export function pendingGuestName(purchaserName: string | null | undefined): string {
  const buyer = (purchaserName ?? '').replace(/\s+/g, ' ').trim();
  return buyer ? `${buyer} - Guest (pending)` : 'Guest (pending)';
}
