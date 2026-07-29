import { describe, it, expect } from 'vitest';
import {
  ADMIN_USER_ACTIONS,
  SUPER_ADMIN_ONLY_ACTIONS,
  canCallerActOnTarget,
  generateTempPassword,
} from '../supabase/functions/_shared/adminUserActions';

const NON_ADMIN_ROLES = ['attendee', 'sponsor', 'exhibitor', '', 'ADMIN'];

describe('canCallerActOnTarget — caller gating', () => {
  it('rejects every non-admin caller for every action', () => {
    for (const role of NON_ADMIN_ROLES) {
      for (const action of ADMIN_USER_ACTIONS) {
        expect(canCallerActOnTarget(role, '', action).allowed).toBe(false);
      }
    }
  });

  it('rejects unknown actions even from a super_admin', () => {
    expect(canCallerActOnTarget('super_admin', '', 'delete-everything').allowed).toBe(false);
    expect(canCallerActOnTarget('super_admin', '', '').allowed).toBe(false);
  });
});

describe('canCallerActOnTarget — target gating', () => {
  it('never allows acting on a super_admin, not even from another super_admin', () => {
    for (const action of ADMIN_USER_ACTIONS) {
      expect(canCallerActOnTarget('super_admin', 'super_admin', action).allowed).toBe(false);
      expect(canCallerActOnTarget('admin', 'super_admin', action).allowed).toBe(false);
    }
  });

  it('blocks a plain admin from managing another admin', () => {
    expect(canCallerActOnTarget('admin', 'admin', 'send-recovery').allowed).toBe(false);
    expect(canCallerActOnTarget('admin', 'admin', 'lookup').allowed).toBe(false);
  });

  it('lets a super_admin manage a plain admin', () => {
    expect(canCallerActOnTarget('super_admin', 'admin', 'send-recovery').allowed).toBe(true);
    expect(canCallerActOnTarget('super_admin', 'admin', 'set-password').allowed).toBe(true);
  });

  it('lets both roles manage ordinary attendees / account-less targets', () => {
    for (const target of ['attendee', '']) {
      expect(canCallerActOnTarget('admin', target, 'send-recovery').allowed).toBe(true);
      expect(canCallerActOnTarget('admin', target, 'create-account').allowed).toBe(true);
      expect(canCallerActOnTarget('super_admin', target, 'confirm-email').allowed).toBe(true);
    }
  });
});

describe('canCallerActOnTarget — set-password restriction', () => {
  it('is super_admin only, whatever the target', () => {
    expect(canCallerActOnTarget('admin', 'attendee', 'set-password').allowed).toBe(false);
    expect(canCallerActOnTarget('admin', '', 'set-password').allowed).toBe(false);
    expect(canCallerActOnTarget('super_admin', 'attendee', 'set-password').allowed).toBe(true);
  });

  it('does not restrict the non-password actions for plain admins', () => {
    const open = ADMIN_USER_ACTIONS.filter(a => !SUPER_ADMIN_ONLY_ACTIONS.includes(a));
    for (const action of open) {
      expect(canCallerActOnTarget('admin', 'attendee', action).allowed).toBe(true);
    }
  });

  it('returns an explanatory reason on every denial', () => {
    const denied = canCallerActOnTarget('admin', 'attendee', 'set-password');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/super admin/i);
  });
});

describe('generateTempPassword', () => {
  it('has the requested length and avoids confusable characters', () => {
    const pw = generateTempPassword();
    expect(pw).toHaveLength(14);
    expect(pw).not.toMatch(/[0O1lI]/);
    expect(generateTempPassword(20)).toHaveLength(20);
  });

  it('does not repeat across calls', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
    expect(seen.size).toBe(50);
  });
});
