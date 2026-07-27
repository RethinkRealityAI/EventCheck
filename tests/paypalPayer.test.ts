import { describe, it, expect } from 'vitest';
import {
  buildPayPalPayer,
  describePayPalError,
  payPalErrorReference,
  sanitizePayPalEmail,
  sanitizePayPalName,
} from '../utils/paypalPayer';

describe('sanitizePayPalEmail', () => {
  it('accepts a normal address', () => {
    expect(sanitizePayPalEmail('tunji@example.com')).toBe('tunji@example.com');
  });

  it('trims surrounding whitespace (mobile keyboards append a space)', () => {
    expect(sanitizePayPalEmail('  tunji@example.com ')).toBe('tunji@example.com');
  });

  it('rejects a dotless domain that <input type="email"> would have allowed', () => {
    expect(sanitizePayPalEmail('tunji@yahoo')).toBeNull();
  });

  it('rejects addresses with internal whitespace or no @', () => {
    expect(sanitizePayPalEmail('tunji ajayi@example.com')).toBeNull();
    expect(sanitizePayPalEmail('tunji.example.com')).toBeNull();
  });

  it('rejects non-string answers from a mis-detected field', () => {
    expect(sanitizePayPalEmail(true)).toBeNull();
    expect(sanitizePayPalEmail(['a@b.com'])).toBeNull();
    expect(sanitizePayPalEmail(undefined)).toBeNull();
  });

  it('rejects an over-long address', () => {
    expect(sanitizePayPalEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });
});

describe('sanitizePayPalName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizePayPalName('  Tunji   Ajayi ')).toBe('Tunji Ajayi');
  });

  it('caps at PayPal\'s 140-char limit', () => {
    expect(sanitizePayPalName('x'.repeat(200))).toHaveLength(140);
  });

  it('drops non-string values', () => {
    expect(sanitizePayPalName(42)).toBe('');
    expect(sanitizePayPalName(null)).toBe('');
  });
});

describe('buildPayPalPayer', () => {
  it('builds a full payer', () => {
    expect(buildPayPalPayer({ givenName: 'Tunji', surname: 'Ajayi', email: 'tunji@example.com' }))
      .toEqual({ name: { given_name: 'Tunji', surname: 'Ajayi' }, email_address: 'tunji@example.com' });
  });

  it('omits a bad email rather than failing the whole order', () => {
    expect(buildPayPalPayer({ givenName: 'Tunji', email: 'tunji@yahoo' }))
      .toEqual({ name: { given_name: 'Tunji' } });
  });

  it('never sends a surname without a given name', () => {
    expect(buildPayPalPayer({ surname: 'Ajayi', email: 'tunji@example.com' }))
      .toEqual({ email_address: 'tunji@example.com' });
  });

  it('returns null when nothing survives, so `payer` is left off entirely', () => {
    expect(buildPayPalPayer({ givenName: '   ', surname: null, email: 'nope' })).toBeNull();
    expect(buildPayPalPayer({})).toBeNull();
  });
});

describe('describePayPalError', () => {
  it('pulls the debug_id and issue out of an Orders API body', () => {
    const err = new Error(
      'Error: Order Api response error: {"name":"UNPROCESSABLE_ENTITY","details":[{"issue":"INVALID_PARAMETER_SYNTAX"}],"debug_id":"a1b2c3d4e5f6"}',
    );
    const info = describePayPalError(err);
    expect(info.debugId).toBe('a1b2c3d4e5f6');
    expect(info.issue).toBe('INVALID_PARAMETER_SYNTAX');
    expect(payPalErrorReference(info)).toBe('a1b2c3d4e5f6');
  });

  it('falls back to the issue code when there is no debug_id', () => {
    const info = describePayPalError('{"name":"CURRENCY_NOT_SUPPORTED"}');
    expect(info.debugId).toBeNull();
    expect(payPalErrorReference(info)).toBe('CURRENCY_NOT_SUPPORTED');
  });

  it('survives an error with nothing useful in it', () => {
    const info = describePayPalError(undefined);
    expect(info.message).toBe('Unknown PayPal error');
    expect(payPalErrorReference(info)).toBeNull();
  });

  it('truncates a huge message', () => {
    expect(describePayPalError(new Error('x'.repeat(5000))).message).toHaveLength(1000);
  });
});
