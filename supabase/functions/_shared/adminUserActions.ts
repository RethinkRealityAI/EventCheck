// Authorization rules + helpers for the admin-user-actions edge function.
//
// Pure — no Deno/Supabase imports — so the repo's Vitest suite covers the
// privilege matrix (CLAUDE.md §16 rule #14). Getting this wrong hands one
// admin the ability to take over another admin's account, so it is tested
// rather than reasoned about.

export const ADMIN_USER_ACTIONS = [
  'lookup',
  'send-recovery',
  'send-magic-link',
  'set-password',
  'confirm-email',
  'create-account',
] as const;

export type AdminUserAction = typeof ADMIN_USER_ACTIONS[number];

/** Actions that hand over direct, silent control of the target account. */
export const SUPER_ADMIN_ONLY_ACTIONS: readonly AdminUserAction[] = ['set-password'];

export interface ActGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether `callerRole` may perform `action` against a user whose role is
 * `targetRole` ('' when the target has no account/profile yet).
 *
 * Rules, in order:
 *   1. Caller must be admin or super_admin.
 *   2. A super_admin target is untouchable by anyone — including another
 *      super_admin. Recovering a super_admin goes through Supabase directly,
 *      so a compromised admin session can never pivot to the top role.
 *   3. An admin target may only be acted on by a super_admin.
 *   4. `set-password` is super_admin only, whatever the target.
 */
export function canCallerActOnTarget(
  callerRole: string,
  targetRole: string,
  action: string,
): ActGuardResult {
  if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    return { allowed: false, reason: 'Forbidden — admin only' };
  }
  if (!ADMIN_USER_ACTIONS.includes(action as AdminUserAction)) {
    return { allowed: false, reason: 'unknown-action' };
  }
  if (targetRole === 'super_admin') {
    return {
      allowed: false,
      reason: 'Super admin accounts cannot be managed here — use the Supabase dashboard.',
    };
  }
  if (targetRole === 'admin' && callerRole !== 'super_admin') {
    return { allowed: false, reason: 'Only a super admin can manage another admin account.' };
  }
  if (SUPER_ADMIN_ONLY_ACTIONS.includes(action as AdminUserAction) && callerRole !== 'super_admin') {
    return { allowed: false, reason: 'Setting a password directly is restricted to super admins.' };
  }
  return { allowed: true };
}

/**
 * 14-char password from an unambiguous alphabet (no 0/O/l/1 confusables) —
 * ~83 bits of entropy. Mirrors admin-invite so relayed credentials read the
 * same wherever they come from.
 */
export function generateTempPassword(length = 14): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}
