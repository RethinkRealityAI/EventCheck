// utils/tscsAbandoned.ts
//
// Who started an India registration and never finished it?
//
// TSCS mails us twice per attempt: a "[PENDING] Incomplete Registration" when
// someone opens checkout, and a "[SUCCESS] Registration Confirmed" carrying a
// Razorpay payment id when they pay. The ingest correctly refuses to register
// anyone from a pending notice — but that left the pending ones as dead rows
// in the review queue, and nobody ever looked at them again.
//
// They are the warmest leads the congress has: people who chose a category,
// filled in a form and reached a payment page. This turns those rows into a
// list worth working.
//
// Two things make it non-trivial, and both are visible in live data:
//
//   RETRIES      One person can generate several pending notices before
//                succeeding (REG-00052 / 53 / 54 are all UDAYAKUMAR DS, who
//                paid on the third). Their earlier attempts are not leads.
//   ORDERING     The pending notice often arrives AFTER the confirmation —
//                seven of sixteen paired registrations in production — so
//                "the last mail was a pending one" proves nothing. Only the
//                presence of a completed attempt anywhere does.

export interface TscsAbandonedInput {
  subject: string | null;
  parsed: Record<string, any> | null;
  receivedAt: string | null;
  status?: string | null;
}

export interface AbandonedCheckout {
  /** The most recent TSCS reference for this person, e.g. "REG-00047". */
  ref: string | null;
  name: string;
  email: string;
  category: string | null;
  /** What the abandoned attempt would have been worth, when the mail said. */
  amountInr: number | null;
  /** How many separate attempts this person left unfinished. */
  attempts: number;
  lastAttemptAt: string | null;
}

const REF_RE = /REG-\d+/i;

/** Did this message describe a checkout that actually completed? */
function isCompleted(row: TscsAbandonedInput): boolean {
  if (row.status === 'ingested' || row.status === 'duplicate') return true;
  if (row.parsed?.payment_id) return true;
  const subject = row.subject ?? '';
  // A [PENDING] subject is never a completion, whatever else it contains —
  // the pending template repeats the word "Confirmed" in its body.
  if (/\[\s*PENDING\s*\]|incomplete\s+registration/i.test(subject)) return false;
  return /\[\s*(?:SUCCESS|PAID)\s*\]/i.test(subject);
}

function normEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * One entry per person who has an unfinished attempt and no finished one.
 * Newest first, so the list reads as a follow-up queue.
 */
export function findAbandonedCheckouts(rows: readonly TscsAbandonedInput[]): AbandonedCheckout[] {
  const completedEmails = new Set<string>();
  const completedRefs = new Set<string>();
  for (const r of rows) {
    if (!isCompleted(r)) continue;
    const email = normEmail(r.parsed?.email);
    if (email) completedEmails.add(email);
    const ref = (r.subject ?? '').match(REF_RE)?.[0]?.toUpperCase();
    if (ref) completedRefs.add(ref);
  }

  const byPerson = new Map<string, AbandonedCheckout & { refs: Set<string> }>();
  for (const r of rows) {
    if (isCompleted(r)) continue;
    const email = normEmail(r.parsed?.email);
    // No address means no way to follow up, so it is not a lead.
    if (!email || completedEmails.has(email)) continue;
    const ref = (r.subject ?? '').match(REF_RE)?.[0]?.toUpperCase() ?? null;
    // The same reference that later succeeded is the same attempt, not a
    // separate abandoned one — this is what makes ordering irrelevant.
    if (ref && completedRefs.has(ref)) continue;

    const at = r.receivedAt ?? null;
    const held = byPerson.get(email);
    if (!held) {
      byPerson.set(email, {
        ref,
        name: String(r.parsed?.name ?? '').trim() || email,
        email,
        category: (String(r.parsed?.category ?? '').trim() || null),
        amountInr: typeof r.parsed?.total_inr === 'number' ? r.parsed.total_inr : null,
        attempts: 0,
        lastAttemptAt: at,
        refs: new Set<string>(),
      });
    }
    const entry = byPerson.get(email)!;
    if (ref) entry.refs.add(ref);
    if (at && (!entry.lastAttemptAt || at > entry.lastAttemptAt)) {
      entry.lastAttemptAt = at;
      entry.ref = ref ?? entry.ref;
      // Keep the freshest details: a retry often fixes the typo that made
      // someone abandon the first attempt.
      const name = String(r.parsed?.name ?? '').trim();
      if (name) entry.name = name;
      const cat = String(r.parsed?.category ?? '').trim();
      if (cat) entry.category = cat;
      if (typeof r.parsed?.total_inr === 'number') entry.amountInr = r.parsed.total_inr;
    }
  }

  return [...byPerson.values()]
    .map(({ refs, ...rest }) => ({ ...rest, attempts: Math.max(refs.size, 1) }))
    .sort((a, b) => String(b.lastAttemptAt ?? '').localeCompare(String(a.lastAttemptAt ?? '')));
}

/** Total rupees sitting in the abandoned queue — the reason to work it. */
export function abandonedValueInr(list: readonly AbandonedCheckout[]): number {
  return list.reduce((sum, r) => sum + (r.amountInr ?? 0), 0);
}
