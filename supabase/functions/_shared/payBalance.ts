// Rules for the standalone payment-link flow (/#/pay?token=…).
//
// WHY THIS EXISTS
// Some attendees end up registered with payment_status='pending' — issued a
// ticket by an admin while a payment claim is verified (Anurati Arora,
// 2026-08-20), or stuck after a PayPal hiccup. They must be able to pay WITHOUT
// re-registering: the payment page shows the amount and a PayPal button and
// nothing else, and a successful capture flips ONLY the payment columns. The
// registration (answers, ticket, QR) is never touched.
//
// This module is the pure decision core — what may be collected and how much —
// so the rules are unit-testable away from Deno/PayPal. Getting them wrong is
// expensive in both directions: collecting on an already-paid row double-
// charges a real person; refusing a payable row strands them.

export interface PayableAmount {
  cents: number;
  currency: string;
}

/**
 * Parse an `attendees.payment_amount` string ("175.00 USD", "0.00", "25 USD").
 *
 * Returns null for anything non-monetary — 'PAID EXTERNALLY', empty, null —
 * NOT zero. Zero means "free", null means "we do not know the price"; treating
 * unknown as free would let a pending row through with nothing to collect,
 * and treating it as payable would invent an amount. The caller must refuse.
 */
export function parsePaymentAmount(raw: string | null | undefined): PayableAmount | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d{1,2})?)\s*([A-Za-z]{3})?$/);
  if (!m) return null;
  const cents = Math.round(parseFloat(m[1]) * 100);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return { cents, currency: (m[2] ?? 'USD').toUpperCase() };
}

export type Payability =
  | { ok: true; cents: number; currency: string }
  | { ok: false; reason: 'already-paid' | 'free' | 'external' | 'cheque' | 'no-amount' | 'not-found' };

/**
 * May this row take an online payment through the link?
 *
 * Deliberately narrow:
 * - `paid`/`free` rows are refused — the page tells them they owe nothing,
 *   which is the idempotency guard against a re-opened link double-charging.
 * - `cheque` rows are refused — that flow settles via ChequeReceivedModal and
 *   collecting online too would double-collect.
 * - `external` rows are refused — sponsor/exhibitor orgs are invoiced; their
 *   "amount" is the org's package price, not a card charge for one person.
 * - An unparseable amount is refused rather than guessed.
 */
export function assessPayability(row: {
  payment_status?: string | null;
  payment_method?: string | null;
  payment_amount?: string | null;
} | null | undefined): Payability {
  if (!row) return { ok: false, reason: 'not-found' };
  const status = (row.payment_status ?? '').toLowerCase();
  if (status === 'paid') return { ok: false, reason: 'already-paid' };
  if (status === 'free') return { ok: false, reason: 'free' };
  const method = (row.payment_method ?? '').toLowerCase();
  if (method === 'cheque') return { ok: false, reason: 'cheque' };
  if (method === 'external') return { ok: false, reason: 'external' };
  const amount = parsePaymentAmount(row.payment_amount);
  if (!amount || amount.cents <= 0) return { ok: false, reason: 'no-amount' };
  return { ok: true, cents: amount.cents, currency: amount.currency };
}

/**
 * Does the captured PayPal amount settle the row?
 *
 * Exact-or-more in the SAME currency. Overpayment is accepted (tips happen;
 * refunding is a human decision), underpayment and currency mismatches are
 * not — a 175 INR capture must never settle a 175 USD balance.
 */
export function captureSettles(
  expected: PayableAmount,
  captured: { amountMajorUnits: number; currency: string },
): boolean {
  if ((captured.currency ?? '').toUpperCase() !== expected.currency) return false;
  const capturedCents = Math.round(captured.amountMajorUnits * 100);
  return capturedCents >= expected.cents;
}

/** The user-facing explanation for each refusal. */
export function payabilityMessage(reason: Exclude<Payability, { ok: true }>['reason']): string {
  switch (reason) {
    case 'already-paid': return 'This registration is already paid — there is nothing owing. You are all set.';
    case 'free': return 'This registration is free — there is nothing to pay. You are all set.';
    case 'cheque': return 'This registration is being settled by cheque. If that has changed, contact the organizers.';
    case 'external': return 'This registration is invoiced to your organization, so there is nothing to pay here.';
    case 'no-amount': return 'We could not determine the amount for this registration. Please contact the organizers.';
    case 'not-found': return 'This payment link is invalid or the registration no longer exists.';
  }
}
