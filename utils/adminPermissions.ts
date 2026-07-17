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
  'content',
] as const;
export type AdminPageKey = typeof ADMIN_PAGE_KEYS[number];

export interface AdminPagePermissions {
  dashboard: boolean;
  forms: boolean;
  sponsors: boolean;
  seating: boolean;
  generateQr: boolean;
  settings: boolean;
  content: boolean;
}

// Feature keys are cross-cutting privileges that aren't tied to a single
// dashboard page/route. Unlike pages, an unset feature defaults to GRANTED
// for admins (see effectiveFeaturePermissions) so existing admins keep the
// capability they had before the feature flag was introduced.
export const ADMIN_FEATURE_KEYS = [
  'exportAttendees',
] as const;
export type AdminFeatureKey = typeof ADMIN_FEATURE_KEYS[number];

export interface AdminFeaturePermissions {
  exportAttendees: boolean;
}

export interface AdminPermissions {
  pages: AdminPagePermissions;
  // Optional so legacy rows (which only ever stored `pages`) stay valid.
  // Resolution treats a missing `features` as "all features granted" for
  // admins — see effectiveFeaturePermissions.
  features?: AdminFeaturePermissions;
}

// Labels used in the admin-management UI.
export const ADMIN_PAGE_LABELS: Record<AdminPageKey, string> = {
  dashboard: 'Dashboard (attendees + stats)',
  forms: 'Manage Forms',
  sponsors: 'Sponsors',
  seating: 'Seating Chart',
  generateQr: 'Generate QR (Manual Ticket Tool)',
  settings: 'Settings',
  content: 'Content (Landing/Portal CMS)',
};

// Labels + helper copy for the feature toggles in the admin-management UI.
export const ADMIN_FEATURE_LABELS: Record<AdminFeatureKey, string> = {
  exportAttendees: 'Export attendees (CSV / PDF)',
};

export const ADMIN_FEATURE_DESCRIPTIONS: Record<AdminFeatureKey, string> = {
  exportAttendees: 'Download attendee lists from the dashboard with filters.',
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
    content: false,
  },
  // Export is a dashboard capability every admin gets out of the box — it's
  // the whole point of "admins should have that feature available by default".
  // A super admin can still uncheck it per-admin from the management UI.
  features: {
    exportAttendees: true,
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
    content: true,
  },
  features: {
    exportAttendees: true,
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
      content: true,
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
      content: false,
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

/**
 * Returns the effective feature permissions for a profile.
 * - super_admin → all true
 * - admin → stored feature flags, but a MISSING flag defaults to `true`.
 *   This is deliberately the opposite of pages: features gate an existing,
 *   already-shipped capability, so legacy admins (whose stored perms predate
 *   the flag) must keep it. A super admin explicitly setting the flag to
 *   `false` is honoured.
 * - anyone else → all false
 */
export function effectiveFeaturePermissions(profile: Profile | null): AdminFeaturePermissions {
  if (isSuperAdmin(profile)) {
    return { exportAttendees: true };
  }
  if (!isAdmin(profile)) {
    return { exportAttendees: false };
  }
  const stored = profile?.adminPermissions?.features ?? null;
  return {
    // `?? true` — unset means granted for admins (see docstring).
    exportAttendees: stored?.exportAttendees ?? true,
  };
}

/** True if the profile can use the named admin feature. */
export function canUseFeature(profile: Profile | null, feature: AdminFeatureKey): boolean {
  return effectiveFeaturePermissions(profile)[feature];
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
      content: true,
    },
    features: {
      exportAttendees: true,
    },
  };
}
