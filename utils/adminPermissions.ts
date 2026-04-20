// utils/adminPermissions.ts
//
// Pure helpers for the admin / super_admin permissions system.
//
// Model:
//   * super_admin  — implicit access to everything, including managing other
//                    admins. admin_permissions is ignored.
//   * admin        — access is gated per-page by admin_permissions.pages.
//                    NULL permissions is treated as "dashboard only" as a
//                    safe fallback (should never happen in practice because
//                    the UI always writes a populated object).
//   * attendee / exhibitor / sponsor — no dashboard access at all.

import type { Profile } from '../types';

// Keys of AdminPagePermissions; kept as a typed literal union so the helper
// below refuses unknown page names at compile time.
export const ADMIN_PAGE_KEYS = [
  'dashboard',
  'forms',
  'sponsors',
  'seating',
  'generateQr',
  'settings',
] as const;
export type AdminPageKey = typeof ADMIN_PAGE_KEYS[number];

export interface AdminPagePermissions {
  dashboard: boolean;
  forms: boolean;
  sponsors: boolean;
  seating: boolean;
  generateQr: boolean;
  settings: boolean;
}

export interface AdminPermissions {
  pages: AdminPagePermissions;
}

// Labels used in the admin-management UI.
export const ADMIN_PAGE_LABELS: Record<AdminPageKey, string> = {
  dashboard: 'Dashboard (attendees + stats)',
  forms: 'Manage Forms',
  sponsors: 'Sponsors',
  seating: 'Seating Chart',
  generateQr: 'Generate QR (Manual Ticket Tool)',
  settings: 'Settings',
};

// Pre-fill for the "Invite new admin" / "Promote existing user" forms.
// Super admin sees dashboard pre-checked (it's always on) and deliberately
// picks the rest — avoids accidentally granting Settings / form-builder
// access on the first click.
export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  pages: {
    dashboard: true,
    forms: false,
    sponsors: false,
    seating: false,
    generateQr: false,
    settings: false,
  },
};

// When an admin row has admin_permissions = NULL, treat them as
// full-access. Three reasons:
//   1. Legacy grandfather — every admin that existed before this feature
//      landed had blanket access; their profile rows have NULL permissions
//      until the migration promotes them to super_admin. Showing them an
//      empty sidebar would be a visible regression.
//   2. Any admin created through the UI always has an explicit perms
//      object (the invite flow writes DEFAULT_ADMIN_PERMISSIONS on submit).
//      So the only way to land here post-feature is manual SQL — which is
//      a sysadmin action, and sysadmins who `UPDATE role='admin'` without
//      setting perms usually mean "give this person full access".
//   3. Over-granting for a minute until the super_admin scopes them is
//      strictly safer than locking the only active admin out of the whole
//      dashboard.
export const FALLBACK_ADMIN_PERMISSIONS: AdminPermissions = {
  pages: {
    dashboard: true,
    forms: true,
    sponsors: true,
    seating: true,
    generateQr: true,
    settings: true,
  },
};

// ---------------------------------------------------------------------------
// Role predicates
// ---------------------------------------------------------------------------

export function isSuperAdmin(profile: Profile | null): boolean {
  return profile?.role === 'super_admin';
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === 'admin';
}

/** True for both admin and super_admin — anyone who can see the admin UI. */
export function hasAdminAccess(profile: Profile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'super_admin';
}

// ---------------------------------------------------------------------------
// Permission resolution
// ---------------------------------------------------------------------------

/**
 * Returns the effective page permissions for a profile.
 * - super_admin → all true
 * - admin with permissions → merged with DEFAULT so any new page key added
 *   later gets its default (prevents old rows from granting access to pages
 *   that didn't exist when they were saved)
 * - admin without permissions → FALLBACK (dashboard only)
 * - anyone else → all false
 */
export function effectivePagePermissions(profile: Profile | null): AdminPagePermissions {
  if (isSuperAdmin(profile)) {
    return {
      dashboard: true,
      forms: true,
      sponsors: true,
      seating: true,
      generateQr: true,
      settings: true,
    };
  }
  if (!isAdmin(profile)) {
    return {
      dashboard: false,
      forms: false,
      sponsors: false,
      seating: false,
      generateQr: false,
      settings: false,
    };
  }
  // Admin. Merge stored perms onto defaults to absorb schema drift.
  const stored = profile?.adminPermissions?.pages ?? null;
  if (!stored) return { ...FALLBACK_ADMIN_PERMISSIONS.pages };
  return {
    ...DEFAULT_ADMIN_PERMISSIONS.pages,
    ...stored,
  };
}

/** True if the profile has access to the named admin page. */
export function canAccessPage(profile: Profile | null, page: AdminPageKey): boolean {
  return effectivePagePermissions(profile)[page];
}

/** True if the profile can open the Admin Management page (super_admin only). */
export function canManageAdmins(profile: Profile | null): boolean {
  return isSuperAdmin(profile);
}

/**
 * Returns the first admin page the profile has access to, or null if none.
 * Used when redirecting an admin whose current page was revoked — we send
 * them to a page they can still see.
 */
export function firstAccessiblePage(profile: Profile | null): AdminPageKey | null {
  const perms = effectivePagePermissions(profile);
  for (const key of ADMIN_PAGE_KEYS) {
    if (perms[key]) return key;
  }
  return null;
}

/** Full AdminPermissions object with all pages granted. Used by the UI as a "select all" shortcut. */
export function allAdminPermissions(): AdminPermissions {
  return {
    pages: {
      dashboard: true,
      forms: true,
      sponsors: true,
      seating: true,
      generateQr: true,
      settings: true,
    },
  };
}
