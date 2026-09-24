// Client side of "create your account" — see
// supabase/functions/account-claim/index.ts for the server and its security
// model. Every call carries the signed kind='account' token from the email.

import { supabase } from './supabaseClient';
import { extractInvokeError } from '../utils/emailSendErrors';

export interface ResolvedAccountClaim {
  eventName: string;
  attendee: { firstName: string; name: string; ticketType: string | null; email: string | null };
  purchaserName: string | null;
  state: 'open' | 'linked' | 'unavailable';
  /** Registered under the purchaser's address: they must bring their own. */
  sharedEmail: boolean;
}

/**
 * What the page does next:
 *  sign-in           — account created pre-verified; sign in with the password.
 *  sign-in-existing  — an account already existed at the new address; the ticket
 *                      is now linked to it, so they sign in with THAT password.
 *  sign-up           — normal sign-up at `email` (confirm-by-email if enabled).
 */
export type ClaimNext = 'sign-in' | 'sign-in-existing' | 'sign-up';

export class AccountClaimError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

/** The server answers `{ error: code, message: human copy }`; show the copy. */
async function toClaimError(error: unknown): Promise<AccountClaimError> {
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && (body.message || body.error)) return new AccountClaimError(String(body.message ?? body.error), body.error);
    } catch { /* not JSON — fall back below */ }
  }
  return new AccountClaimError(await extractInvokeError(error));
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('account-claim', { body });
  if (error) throw await toClaimError(error);
  return data as T;
}

export function resolveAccountClaim(token: string): Promise<ResolvedAccountClaim> {
  return invoke<ResolvedAccountClaim>({ action: 'resolve', token });
}

export function submitAccountClaim(
  token: string, email: string, password: string,
): Promise<{ ok: true; next: ClaimNext; email: string }> {
  return invoke({ action: 'claim', token, email, password });
}
