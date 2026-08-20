import { describe, it, expect } from 'vitest';
import {
  parsePaymentAmount,
  assessPayability,
  captureSettles,
  payabilityMessage,
} from '../supabase/functions/_shared/payBalance';
import { signPayToken, verifyPayToken, signInviteToken } from '../supabase/functions/_shared/registrationToken';

const SECRET = 'test-secret';
const NOW = 1_700_000_000_000;
const TTL = 180 * 24 * 60 * 60 * 1000;

describe('pay token', () => {
  it('round-trips', async () => {
    const t = await signPayToken('att-123', SECRET, NOW, TTL);
    const v = await verifyPayToken(t, SECRET, NOW + 1000);
    expect(v).toEqual({ valid: true, attendeeId: 'att-123' });
  });

  it('expires', async () => {
    const t = await signPayToken('att-123', SECRET, NOW, 1000);
    const v = await verifyPayToken(t, SECRET, NOW + 2000);
    expect(v).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a tampered signature', async () => {
    const t = await signPayToken('att-123', SECRET, NOW, TTL);
    const v = await verifyPayToken(t.slice(0, -2) + 'xx', SECRET, NOW);
    expect(v).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects an INVITE token — a registration invite must never authorise a payment', async () => {
    const invite = await signInviteToken('contact-1', 'form-1', SECRET, NOW, TTL);
    const v = await verifyPayToken(invite, SECRET, NOW);
    expect(v).toEqual({ valid: false, reason: 'wrong-kind' });
  });

  it('rejects garbage', async () => {
    expect(await verifyPayToken('', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
    expect(await verifyPayToken('a.b.c', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
  });
});

describe('parsePaymentAmount', () => {
  it('parses the shapes the attendees table actually holds', () => {
    // Anurati's row is '175.00 USD'; older rows vary.
    expect(parsePaymentAmount('175.00 USD')).toEqual({ cents: 17500, currency: 'USD' });
    expect(parsePaymentAmount('25 USD')).toEqual({ cents: 2500, currency: 'USD' });
    expect(parsePaymentAmount('0.00 USD')).toEqual({ cents: 0, currency: 'USD' });
    expect(parsePaymentAmount('0')).toEqual({ cents: 0, currency: 'USD' });
  });

  it('returns null — not zero — for non-monetary values', () => {
    // 'PAID EXTERNALLY' is the live value on sponsor/exhibitor rows. Null means
    // "unknown", and unknown must be refused, not treated as free.
    expect(parsePaymentAmount('PAID EXTERNALLY')).toBeNull();
    expect(parsePaymentAmount('')).toBeNull();
    expect(parsePaymentAmount(null)).toBeNull();
    expect(parsePaymentAmount(undefined)).toBeNull();
    expect(parsePaymentAmount('USD 175.00')).toBeNull();
  });

  it('rounds sub-cent inputs instead of truncating', () => {
    expect(parsePaymentAmount('17.5')).toEqual({ cents: 1750, currency: 'USD' });
  });
});

describe('assessPayability', () => {
  const pending = { payment_status: 'pending', payment_method: 'paypal', payment_amount: '175.00 USD' };

  it('accepts the exact shape of the row this feature was built for', () => {
    expect(assessPayability(pending)).toEqual({ ok: true, cents: 17500, currency: 'USD' });
  });

  it('refuses an already-paid row — the double-charge guard', () => {
    expect(assessPayability({ ...pending, payment_status: 'paid' }))
      .toEqual({ ok: false, reason: 'already-paid' });
  });

  it('refuses free, cheque and external rows', () => {
    expect(assessPayability({ ...pending, payment_status: 'free' })).toEqual({ ok: false, reason: 'free' });
    expect(assessPayability({ ...pending, payment_method: 'cheque' })).toEqual({ ok: false, reason: 'cheque' });
    expect(assessPayability({ ...pending, payment_method: 'external', payment_amount: 'PAID EXTERNALLY' }))
      .toEqual({ ok: false, reason: 'external' });
  });

  it('refuses when the amount is unknown or zero rather than guessing', () => {
    expect(assessPayability({ ...pending, payment_amount: null })).toEqual({ ok: false, reason: 'no-amount' });
    expect(assessPayability({ ...pending, payment_amount: '0.00 USD' })).toEqual({ ok: false, reason: 'no-amount' });
  });

  it('refuses a missing row', () => {
    expect(assessPayability(null)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('has a user-facing message for every refusal', () => {
    for (const reason of ['already-paid', 'free', 'external', 'cheque', 'no-amount', 'not-found'] as const) {
      expect(payabilityMessage(reason).length).toBeGreaterThan(10);
    }
  });
});

describe('captureSettles', () => {
  const expected = { cents: 17500, currency: 'USD' };

  it('accepts an exact capture', () => {
    expect(captureSettles(expected, { amountMajorUnits: 175.0, currency: 'USD' })).toBe(true);
  });

  it('accepts overpayment but never underpayment', () => {
    expect(captureSettles(expected, { amountMajorUnits: 180, currency: 'USD' })).toBe(true);
    expect(captureSettles(expected, { amountMajorUnits: 174.99, currency: 'USD' })).toBe(false);
  });

  it('never lets a different currency settle the balance', () => {
    // 175 INR is about two dollars — the whole point of this check.
    expect(captureSettles(expected, { amountMajorUnits: 175, currency: 'INR' })).toBe(false);
    expect(captureSettles(expected, { amountMajorUnits: 175, currency: '' })).toBe(false);
  });

  it('is case-insensitive on currency codes', () => {
    expect(captureSettles(expected, { amountMajorUnits: 175, currency: 'usd' })).toBe(true);
  });
});
