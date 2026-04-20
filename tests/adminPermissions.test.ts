import { describe, it, expect } from 'vitest';
import type { Profile, AdminPermissions } from '../types';
import {
  ADMIN_PAGE_KEYS,
  DEFAULT_ADMIN_PERMISSIONS,
  FALLBACK_ADMIN_PERMISSIONS,
  allAdminPermissions,
  canAccessPage,
  canManageAdmins,
  effectivePagePermissions,
  firstAccessiblePage,
  hasAdminAccess,
  isAdmin,
  isSuperAdmin,
} from '../utils/adminPermissions';

const baseProfile = (overrides: Partial<Profile>): Profile => ({
  id: 'p1',
  email: 't@example.com',
  fullName: 'Test',
  role: 'attendee',
  organization: null,
  countryCode: null,
  phone: null,
  avatarUrl: null,
  adminPermissions: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Role predicates
// ---------------------------------------------------------------------------

describe('role predicates', () => {
  it('isSuperAdmin returns true only for role=super_admin', () => {
    expect(isSuperAdmin(baseProfile({ role: 'super_admin' }))).toBe(true);
    expect(isSuperAdmin(baseProfile({ role: 'admin' }))).toBe(false);
    expect(isSuperAdmin(baseProfile({ role: 'attendee' }))).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });

  it('isAdmin returns true only for role=admin (not super_admin)', () => {
    expect(isAdmin(baseProfile({ role: 'admin' }))).toBe(true);
    expect(isAdmin(baseProfile({ role: 'super_admin' }))).toBe(false);
    expect(isAdmin(baseProfile({ role: 'attendee' }))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('hasAdminAccess returns true for both admin and super_admin', () => {
    expect(hasAdminAccess(baseProfile({ role: 'admin' }))).toBe(true);
    expect(hasAdminAccess(baseProfile({ role: 'super_admin' }))).toBe(true);
    expect(hasAdminAccess(baseProfile({ role: 'attendee' }))).toBe(false);
    expect(hasAdminAccess(baseProfile({ role: 'sponsor' }))).toBe(false);
    expect(hasAdminAccess(null)).toBe(false);
  });

  it('canManageAdmins is super_admin only', () => {
    expect(canManageAdmins(baseProfile({ role: 'super_admin' }))).toBe(true);
    expect(canManageAdmins(baseProfile({ role: 'admin' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Permission resolution
// ---------------------------------------------------------------------------

describe('effectivePagePermissions', () => {
  it('super_admin gets all pages', () => {
    const perms = effectivePagePermissions(baseProfile({ role: 'super_admin' }));
    for (const k of ADMIN_PAGE_KEYS) expect(perms[k]).toBe(true);
  });

  it('non-admin gets nothing', () => {
    const perms = effectivePagePermissions(baseProfile({ role: 'attendee' }));
    for (const k of ADMIN_PAGE_KEYS) expect(perms[k]).toBe(false);
  });

  it('null profile gets nothing', () => {
    const perms = effectivePagePermissions(null);
    for (const k of ADMIN_PAGE_KEYS) expect(perms[k]).toBe(false);
  });

  it('admin with NULL permissions falls back to full access (legacy grandfathering)', () => {
    const perms = effectivePagePermissions(baseProfile({ role: 'admin', adminPermissions: null }));
    expect(perms).toEqual(FALLBACK_ADMIN_PERMISSIONS.pages);
    for (const k of ADMIN_PAGE_KEYS) expect(perms[k]).toBe(true);
  });

  it('admin with stored permissions returns those permissions', () => {
    const custom: AdminPermissions = {
      pages: {
        dashboard: true,
        forms: true,
        sponsors: false,
        seating: false,
        generateQr: true,
        settings: false,
      },
    };
    const perms = effectivePagePermissions(baseProfile({ role: 'admin', adminPermissions: custom }));
    expect(perms.forms).toBe(true);
    expect(perms.generateQr).toBe(true);
    expect(perms.sponsors).toBe(false);
    expect(perms.settings).toBe(false);
  });

  it('admin with partial permissions (schema drift) merges missing keys with DEFAULT', () => {
    // Simulate an older row that predates a hypothetical new page key
    const partial = { pages: { dashboard: true, forms: true } } as unknown as AdminPermissions;
    const perms = effectivePagePermissions(baseProfile({ role: 'admin', adminPermissions: partial }));
    // forms set true by stored, sponsors should default false (from DEFAULT)
    expect(perms.forms).toBe(true);
    expect(perms.sponsors).toBe(false);
    expect(perms.seating).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAccessPage
// ---------------------------------------------------------------------------

describe('canAccessPage', () => {
  it('super_admin can access every page', () => {
    const p = baseProfile({ role: 'super_admin' });
    for (const k of ADMIN_PAGE_KEYS) expect(canAccessPage(p, k)).toBe(true);
  });

  it('non-admin cannot access any page', () => {
    const p = baseProfile({ role: 'attendee' });
    for (const k of ADMIN_PAGE_KEYS) expect(canAccessPage(p, k)).toBe(false);
  });

  it('admin respects stored permissions', () => {
    const p = baseProfile({
      role: 'admin',
      adminPermissions: {
        pages: {
          dashboard: true,
          forms: true,
          sponsors: false,
          seating: false,
          generateQr: false,
          settings: false,
        },
      },
    });
    expect(canAccessPage(p, 'forms')).toBe(true);
    expect(canAccessPage(p, 'settings')).toBe(false);
  });

  it('DEFAULT starting perms grant only dashboard', () => {
    const p = baseProfile({ role: 'admin', adminPermissions: DEFAULT_ADMIN_PERMISSIONS });
    expect(canAccessPage(p, 'dashboard')).toBe(true);
    expect(canAccessPage(p, 'forms')).toBe(false);
    expect(canAccessPage(p, 'settings')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// firstAccessiblePage
// ---------------------------------------------------------------------------

describe('firstAccessiblePage', () => {
  it('returns dashboard for super_admin (first in list)', () => {
    expect(firstAccessiblePage(baseProfile({ role: 'super_admin' }))).toBe('dashboard');
  });

  it('returns null when profile has no permissions at all', () => {
    const p = baseProfile({
      role: 'admin',
      adminPermissions: {
        pages: {
          dashboard: false,
          forms: false,
          sponsors: false,
          seating: false,
          generateQr: false,
          settings: false,
        },
      },
    });
    expect(firstAccessiblePage(p)).toBeNull();
  });

  it('returns the first page in ADMIN_PAGE_KEYS order that is enabled', () => {
    const p = baseProfile({
      role: 'admin',
      adminPermissions: {
        pages: {
          dashboard: false,
          forms: false,
          sponsors: true,
          seating: false,
          generateQr: true,
          settings: false,
        },
      },
    });
    expect(firstAccessiblePage(p)).toBe('sponsors');
  });

  it('returns null for attendee', () => {
    expect(firstAccessiblePage(baseProfile({ role: 'attendee' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// allAdminPermissions
// ---------------------------------------------------------------------------

describe('allAdminPermissions', () => {
  it('returns all-true pages object', () => {
    const all = allAdminPermissions();
    for (const k of ADMIN_PAGE_KEYS) expect(all.pages[k]).toBe(true);
  });

  it('DEFAULT_ADMIN_PERMISSIONS grants dashboard only', () => {
    expect(DEFAULT_ADMIN_PERMISSIONS.pages.dashboard).toBe(true);
    for (const k of ADMIN_PAGE_KEYS) {
      if (k === 'dashboard') continue;
      expect(DEFAULT_ADMIN_PERMISSIONS.pages[k]).toBe(false);
    }
  });
});
