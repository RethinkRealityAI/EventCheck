import type { Session, User } from '@supabase/supabase-js';

/** True once Supabase has recorded a successful email confirmation. */
export function isEmailVerified(user: User | null | undefined): boolean {
  return !!user?.email_confirmed_at;
}

/** Authorization header for verify-payment when the user has an active session. */
export function paymentAuthHeaders(
  session: Session | null | undefined,
): Record<string, string> {
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

/** @deprecated Use paymentAuthHeaders — email verification is not required to pay. */
export function verifiedPaymentAuthHeaders(
  session: Session | null | undefined,
  _user?: User | null | undefined,
): Record<string, string> {
  return paymentAuthHeaders(session);
}

export const EMAIL_VERIFY_BEFORE_REGISTER_MSG =
  'Please verify your email before completing registration. '
  + 'Open the link we sent you, or sign in on the home page and use Resend verification email.';

export const EMAIL_VERIFY_BEFORE_SIGNIN_MSG =
  'Your email isn\u2019t verified yet. Check your inbox for the link, or resend it below.';
