// utils/paypalPayer.ts
//
// Sanitizers for the PayPal order `payer` prefill + a decoder for the opaque
// errors the PayPal JS SDK hands to `onError`.
//
// Why this exists: the registration form prefills `payer.name` /
// `payer.email_address` on the order so the merchant dashboard shows a real
// person instead of a blank guest. Those values are raw form answers, and the
// Orders v2 API validates them strictly — an email the browser accepts
// (`type="email"` allows a dotless domain like `ade@yahoo`) is rejected by
// PayPal with a 400, which the SDK surfaces to `onError` as nothing more than
// "Something went wrong". A rejected order-create looks identical to a card
// decline to the buyer, so bad prefill data silently kills checkout.
//
// Rule: never send a payer field we aren't sure PayPal will accept. Dropping a
// prefill only costs a nicer dashboard entry; sending a bad one costs the sale.

/** PayPal's `payer.email_address` requires a dotted domain. Deliberately the
 *  same shape used server-side in verify-payment for staff/guest emails. */
export const PAYPAL_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Orders v2 caps: email 254, given_name/surname 140. */
const MAX_EMAIL = 254;
const MAX_NAME = 140;

export interface PayPalPayerName {
  given_name: string;
  surname?: string;
}

export interface PayPalPayer {
  name?: PayPalPayerName;
  email_address?: string;
}

/** Trim + collapse whitespace. Non-string answers (checkbox arrays, booleans
 *  from a mis-detected field) collapse to '' so they're dropped, not sent. */
export function sanitizePayPalName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, MAX_NAME);
}

/** Returns a PayPal-acceptable email, or null when the value can't be one. */
export function sanitizePayPalEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!cleaned || cleaned.length > MAX_EMAIL) return null;
  return PAYPAL_EMAIL_RE.test(cleaned) ? cleaned : null;
}

/**
 * Build the `payer` object for an order, or null when nothing survives
 * sanitizing. `payer.name` is only sent with a given_name — PayPal rejects a
 * name object that has a surname alone.
 */
export function buildPayPalPayer(input: {
  givenName?: unknown;
  surname?: unknown;
  email?: unknown;
}): PayPalPayer | null {
  const payer: PayPalPayer = {};

  const givenName = sanitizePayPalName(input.givenName);
  if (givenName) {
    const surname = sanitizePayPalName(input.surname);
    payer.name = surname ? { given_name: givenName, surname } : { given_name: givenName };
  }

  const email = sanitizePayPalEmail(input.email);
  if (email) payer.email_address = email;

  return Object.keys(payer).length > 0 ? payer : null;
}

export interface PayPalErrorInfo {
  /** Best available human-readable cause, truncated for display/logging. */
  message: string;
  /** PayPal's `debug_id` when present — the id their support team asks for. */
  debugId: string | null;
  /** The machine issue code (e.g. INVALID_PARAMETER_SYNTAX) when present. */
  issue: string | null;
}

/**
 * The SDK gives `onError` an Error whose message often embeds the raw Orders
 * API JSON body. Pull out the parts worth logging + showing so a failed
 * checkout can actually be traced back afterwards.
 */
export function describePayPalError(err: unknown): PayPalErrorInfo {
  let message = '';
  if (typeof err === 'string') message = err;
  else if (err && typeof err === 'object') {
    message = String((err as any).message ?? (err as any).toString?.() ?? '');
  }
  message = message.replace(/\s+/g, ' ').trim();

  const debugId = /"?debug_id"?\s*[:=]\s*"?([A-Za-z0-9_-]+)/.exec(message)?.[1] ?? null;
  const issue = /"issue"\s*:\s*"([A-Z_]+)"/.exec(message)?.[1]
    ?? /"name"\s*:\s*"([A-Z_]+)"/.exec(message)?.[1]
    ?? null;

  return {
    message: message.slice(0, 1000) || 'Unknown PayPal error',
    debugId,
    issue,
  };
}

/** Short user-facing reference so a buyer can quote something actionable. */
export function payPalErrorReference(info: PayPalErrorInfo): string | null {
  if (info.debugId) return info.debugId.slice(0, 24);
  if (info.issue) return info.issue;
  return null;
}
