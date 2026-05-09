// services/adminManagementService.ts
//
// Client-side CRUD for admin profiles. All operations rely on RLS policies
// set by the 20260421_add_super_admin_and_permissions migration — the
// client call will fail cleanly if the caller isn't a super_admin.
//
// Inviting a brand-new user (one who doesn't have an auth.users row yet)
// cannot be done from the client because it requires the service-role key.
// That path calls the `admin-invite` edge function instead.

import { supabase } from './supabaseClient';
import { mapProfileFromDb } from './profileService';
import type { Profile, AdminPermissions } from '../types';

export interface AdminInviteResult {
  success: boolean;
  userId?: string;
  /** Email that was provisioned — echoed from the server. */
  email?: string;
  /** Auto-generated temporary password. Caller must display this to the
   *  super admin so they can hand the credentials to the new admin. Not
   *  stored anywhere; regenerating requires another invite flow. */
  tempPassword?: string;
  /** Absolute login URL (origin + /#/login) for the caller to share. */
  loginUrl?: string;
  error?: string;
  alreadyExists?: boolean;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** All admin + super_admin profiles, newest first. */
export async function listAdminProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['admin', 'super_admin'])
    .order('created_at', { ascending: false });
  if (error) { console.error('listAdminProfiles', error); return []; }
  return (data ?? []).map(mapProfileFromDb);
}

/** Case-insensitive email lookup across ALL profiles (for the Promote flow). */
export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', trimmed)
    .maybeSingle();
  if (error) { console.error('findProfileByEmail', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

// ---------------------------------------------------------------------------
// Write — rely on RLS (profiles_super_admin_update policy)
// ---------------------------------------------------------------------------

/** Promote an existing profile to admin and set their initial permissions. */
export async function promoteToAdmin(
  userId: string,
  permissions: AdminPermissions,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      role: 'admin',
      admin_permissions: permissions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) { console.error('promoteToAdmin', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

/** Update an existing admin's page permissions. */
export async function updateAdminPermissions(
  userId: string,
  permissions: AdminPermissions,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      admin_permissions: permissions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) { console.error('updateAdminPermissions', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

/**
 * Demote an admin back to 'attendee'. Clears their permissions. Blocked at
 * the DB level by the prevent_self_role_change trigger if they try it on
 * themselves — we also guard in the UI.
 */
export async function demoteAdmin(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      role: 'attendee',
      admin_permissions: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) { console.error('demoteAdmin', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

/** Promote an admin (or any user) to super_admin. Reserved for rare manual use. */
export async function promoteToSuperAdmin(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      role: 'super_admin',
      admin_permissions: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .maybeSingle();
  if (error) { console.error('promoteToSuperAdmin', error); return null; }
  return data ? mapProfileFromDb(data) : null;
}

// ---------------------------------------------------------------------------
// Invite new user (edge function, because client can't create auth.users)
// ---------------------------------------------------------------------------

export async function inviteAdmin(params: {
  email: string;
  fullName?: string;
  permissions: AdminPermissions;
}): Promise<AdminInviteResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'Not signed in' };

  const { data, error } = await supabase.functions.invoke('admin-invite', {
    body: params,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) {
    // supabase-js wraps non-2xx responses in FunctionsHttpError with a generic
    // "Edge function returned a non-2xx status code" message and stuffs the
    // raw Response in error.context. Read the body so the real validation
    // error (e.g. "user already exists") reaches the UI instead of the
    // useless wrapper message. FunctionsFetchError (network/CORS) has no
    // context — fall back to its message.
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json();
        if (body?.error) {
          return {
            success: false,
            error: body.error,
            alreadyExists: Boolean(body.alreadyExists),
          };
        }
      } catch {
        // Body wasn't JSON — fall through to the generic message below.
      }
    }
    return {
      success: false,
      error: error.message || 'Invite failed — could not reach the server.',
    };
  }
  if (data?.error) {
    return {
      success: false,
      error: data.error,
      alreadyExists: Boolean(data.alreadyExists),
    };
  }
  return {
    success: true,
    userId: data?.userId,
    email: data?.email,
    tempPassword: data?.tempPassword,
    loginUrl: data?.loginUrl,
  };
}
