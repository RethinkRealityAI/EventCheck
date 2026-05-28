import { describe, expect, it } from 'vitest';
import {
  isEmailVerified,
  verifiedPaymentAuthHeaders,
} from '../utils/authSession';

describe('isEmailVerified', () => {
  it('is false without email_confirmed_at', () => {
    expect(isEmailVerified({ id: '1', email: 'a@b.c' } as never)).toBe(false);
  });

  it('is true when email_confirmed_at is set', () => {
    expect(isEmailVerified({ email_confirmed_at: '2026-01-01' } as never)).toBe(true);
  });
});

describe('verifiedPaymentAuthHeaders', () => {
  it('omits Authorization for unverified user', () => {
    expect(
      verifiedPaymentAuthHeaders(
        { access_token: 'tok' } as never,
        { id: '1' } as never,
      ),
    ).toEqual({});
  });

  it('includes Authorization when verified', () => {
    expect(
      verifiedPaymentAuthHeaders(
        { access_token: 'tok' } as never,
        { email_confirmed_at: '2026-01-01' } as never,
      ),
    ).toEqual({ Authorization: 'Bearer tok' });
  });
});
