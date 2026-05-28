import type { Session, User } from '@supabase/supabase-js';

/** True once Supabase has recorded a successful email confirmation. */
export function isEmailVerified(user: User | null | undefined): boolean {
  return !!user?.email_confirmed_at;
}

/**
 * Authorization header for verify-payment — only when the JWT belongs to a
 * verified account. Unverified sessions must not be sent (server returns 401).
 */
export function verifiedPaymentAuthHeaders(
  session: Session | null | undefined,
  user: User | null | undefined,
): Record<string, string> {
  if (session?.access_token && isEmailVerified(user)) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export const EMAIL_VERIFY_BEFORE_REGISTER_MSG =
  'Please verify your email before completing registration. '
  + 'Open the link we sent you, or sign in on the home page and use Resend verification email.';

export const EMAIL_VERIFY_BEFORE_SIGNIN_MSG =
  'Your email isn\u2019t verified yet. Check your inbox for the link, or resend it below.';
