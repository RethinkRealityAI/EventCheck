import { describe, expect, it } from 'vitest';
import {
  isEmailVerified,
  paymentAuthHeaders,
} from '../utils/authSession';

describe('isEmailVerified', () => {
  it('is false without email_confirmed_at', () => {
    expect(isEmailVerified({ id: '1', email: 'a@b.c' } as never)).toBe(false);
  });

  it('is true when email_confirmed_at is set', () => {
    expect(isEmailVerified({ email_confirmed_at: '2026-01-01' } as never)).toBe(true);
  });
});

describe('paymentAuthHeaders', () => {
  it('omits Authorization without session', () => {
    expect(paymentAuthHeaders(null)).toEqual({});
  });

  it('includes Authorization when session has access_token', () => {
    expect(
      paymentAuthHeaders({ access_token: 'tok' } as never),
    ).toEqual({ Authorization: 'Bearer tok' });
  });
});
