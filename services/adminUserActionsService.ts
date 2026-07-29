// Client wrapper for the `admin-user-actions` edge function — dashboard-side
// account management so the team never has to open the Supabase dashboard to
// help a registrant who can't sign in.
//
// Every rule that matters (caller role, `manageUsers` feature, super-admin-only
// password setting, never touching a super_admin target) is enforced INSIDE the
// edge function. The helpers here shape requests and unwrap errors; they are
// not a security boundary.

import { supabase } from './supabaseClient';

export type AdminUserAction =
  | 'lookup'
  | 'send-recovery'
  | 'send-magic-link'
  | 'set-password'
  | 'confirm-email'
  | 'create-account';

export interface AdminUserLookup {
  exists: boolean;
  userId: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  role: string | null;
}

export interface AdminUserActionResult {
  ok: boolean;
  /** Recovery / magic-link URL — always returned so the admin can relay it by
   *  hand when delivery fails or they chose not to send. */
  link?: string;
  emailSent?: boolean;
  emailError?: string | null;
  tempPassword?: string;
  loginUrl?: string;
  alreadyConfirmed?: boolean;
}

/**
 * supabase-js sets `data = null` on any non-2xx, stashing the JSON body on
 * `error.context`. Without reading that, every failure surfaces as the useless
 * "Edge Function returned a non-2xx status code" (the same trap documented for
 * bogo-send in CLAUDE.md §19).
 */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-user-actions', { body });
  if (error) {
    let detail = '';
    try {
      const parsed = await (error as any).context?.json?.();
      detail = parsed?.message || parsed?.error || '';
    } catch { /* body wasn't JSON */ }
    throw new Error(detail || error.message || 'Account action failed.');
  }
  if (data && (data as any).error) {
    throw new Error((data as any).message || (data as any).error);
  }
  return data as T;
}

/** Does this address have a portal account, and is it usable? */
export function lookupUser(email: string): Promise<AdminUserLookup> {
  return invoke<AdminUserLookup>({ action: 'lookup', email });
}

/** Password-reset link. `deliver: false` returns the URL without emailing. */
export function sendPasswordReset(email: string, deliver = true): Promise<AdminUserActionResult> {
  return invoke<AdminUserActionResult>({ action: 'send-recovery', email, deliver });
}

/** Passwordless sign-in link. `deliver: false` returns the URL without emailing. */
export function sendMagicLink(email: string, deliver = true): Promise<AdminUserActionResult> {
  return invoke<AdminUserActionResult>({ action: 'send-magic-link', email, deliver });
}

/** Set a known password directly (super_admin only, server-enforced). */
export function setUserPassword(email: string, password: string): Promise<AdminUserActionResult> {
  return invoke<AdminUserActionResult>({ action: 'set-password', email, password });
}

/** Mark an unverified address confirmed so the user can sign in. */
export function confirmUserEmail(email: string): Promise<AdminUserActionResult> {
  return invoke<AdminUserActionResult>({ action: 'confirm-email', email });
}

/** Create a pre-verified portal account and return the temp password to relay. */
export function createPortalAccount(email: string, fullName?: string): Promise<AdminUserActionResult> {
  return invoke<AdminUserActionResult>({ action: 'create-account', email, fullName: fullName ?? '' });
}
