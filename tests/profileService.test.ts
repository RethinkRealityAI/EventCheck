import { describe, it, expect } from 'vitest';
import { mapProfileFromDb } from '../services/profileService';

describe('mapProfileFromDb', () => {
  it('maps snake_case DB columns to camelCase Profile', () => {
    const row = {
      id: 'u-1', email: 'x@y.z', full_name: 'Test', role: 'attendee',
      organization: 'ACME', country_code: 'IN', phone: null,
      avatar_url: null, created_at: 't', updated_at: 't',
    };
    const p = mapProfileFromDb(row);
    expect(p).toEqual({
      id: 'u-1', email: 'x@y.z', fullName: 'Test', role: 'attendee',
      organization: 'ACME', countryCode: 'IN', phone: null,
      avatarUrl: null, adminPermissions: null,
      createdAt: 't', updatedAt: 't',
    });
  });

  it('parses admin_permissions jsonb when present (object)', () => {
    const row = {
      id: 'u-3', email: 'admin@x.com', full_name: 'Admin', role: 'admin',
      organization: null, country_code: null, phone: null,
      avatar_url: null, created_at: 't', updated_at: 't',
      admin_permissions: { pages: { dashboard: true, forms: true, sponsors: false, seating: false, generateQr: false, settings: false } },
    };
    const p = mapProfileFromDb(row);
    expect(p.adminPermissions?.pages.forms).toBe(true);
    expect(p.adminPermissions?.pages.settings).toBe(false);
  });

  it('parses admin_permissions jsonb when stored as a string', () => {
    const row = {
      id: 'u-4', email: 'admin@x.com', full_name: 'Admin', role: 'admin',
      organization: null, country_code: null, phone: null,
      avatar_url: null, created_at: 't', updated_at: 't',
      admin_permissions: '{"pages":{"dashboard":true,"forms":false,"sponsors":false,"seating":false,"generateQr":false,"settings":true}}',
    };
    const p = mapProfileFromDb(row);
    expect(p.adminPermissions?.pages.settings).toBe(true);
    expect(p.adminPermissions?.pages.forms).toBe(false);
  });

  it('preserves null/undefined for optional fields', () => {
    const row = {
      id: 'u-2', email: 'a@b.c', full_name: null, role: 'admin',
      organization: null, country_code: null, phone: null,
      avatar_url: null, created_at: 't', updated_at: 't',
    };
    expect(mapProfileFromDb(row).fullName).toBeNull();
    expect(mapProfileFromDb(row).organization).toBeNull();
  });
});
