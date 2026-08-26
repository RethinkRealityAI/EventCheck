import { describe, it, expect } from 'vitest';
import { formatVerifyPaymentError } from '../utils/verifyPaymentErrors';

describe('formatVerifyPaymentError', () => {
  it('maps known BOGO codes to friendly copy', () => {
    expect(formatVerifyPaymentError('BOGO_BAD_INDEX', 'BOGO_BAD_INDEX'))
      .toMatch(/complimentary guest/i);
  });

  it('translates INSTRUMENT_DECLINED into pending-hold guidance', () => {
    const msg = formatVerifyPaymentError(
      'PayPal capture failed: INSTRUMENT_DECLINED (debug_id: abc123)',
    );
    // The buyer's statement shows a pending authorization hold even though the
    // capture was declined — the copy must say no charge completed and that
    // the hold reverses on its own (the "charged but site says failed" report).
    expect(msg).toMatch(/declined/i);
    expect(msg).toMatch(/authorization hold/i);
    expect(msg).toMatch(/not completed/i);
    expect(msg).not.toMatch(/INSTRUMENT_DECLINED/);
  });

  it('passes post-capture DB-error messages through verbatim', () => {
    const raw = 'Your payment was processed but we encountered a database error saving your registration. Please contact the event organizer with this reference: 4XJ12345';
    expect(formatVerifyPaymentError(raw)).toBe(raw);
  });

  it('passes unknown errors through verbatim', () => {
    expect(formatVerifyPaymentError('Something odd')).toBe('Something odd');
  });
});
