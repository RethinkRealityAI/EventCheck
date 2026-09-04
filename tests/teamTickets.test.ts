import { describe, it, expect } from 'vitest';
import {
  isTeamPrimary,
  selectTeamPrimaries,
  isPendingStaff,
  staffPassLabel,
  quotaForPrimary,
  seatUsage,
  canAssignCategory,
} from '../utils/teamTickets';
import type { Attendee } from '../types';

const row = (patch: Partial<Attendee>): Attendee => ({
  id: 'a1',
  formId: 'gansid-congress-2026-staff',
  name: 'Someone',
  email: 'someone@example.com',
  ticketType: 'Full Congress',
  registeredAt: '2026-09-03T00:00:00.000Z',
  paymentStatus: 'paid',
  ...patch,
} as Attendee);

describe('isTeamPrimary', () => {
  it('accepts a sponsor booking and an exhibitor booking', () => {
    expect(isTeamPrimary(row({ isPrimary: true, sponsorTier: 'gold' }))).toBe(true);
    expect(isTeamPrimary(row({ isPrimary: true, exhibitorBoothType: 'standard' }))).toBe(true);
  });

  it('rejects an ordinary attendee, however senior-looking', () => {
    expect(isTeamPrimary(row({ isPrimary: true }))).toBe(false);
    expect(isTeamPrimary(row({ isPrimary: true, ticketType: 'Sponsor' }))).toBe(false);
  });

  it('rejects a staff row sitting under a sponsor booking', () => {
    // The flag alone is not enough: this is the row that would otherwise make
    // a staff member look like the org's primary contact and hand them the
    // whole delegation's tickets.
    expect(isTeamPrimary(row({
      isPrimary: false,
      sponsorTier: 'gold',
      primaryAttendeeId: 'org-1',
    }))).toBe(false);
  });

  it('treats a missing isPrimary as not primary', () => {
    expect(isTeamPrimary(row({ sponsorTier: 'gold' }))).toBe(false);
  });
});

describe('selectTeamPrimaries', () => {
  it('picks only the org bookings out of a user\'s rows', () => {
    const rows = [
      row({ id: 'own-ticket', isPrimary: true }),
      row({ id: 'org', isPrimary: true, sponsorTier: 'gold' }),
      row({ id: 'staff', isPrimary: false, primaryAttendeeId: 'org' }),
    ];
    expect(selectTeamPrimaries(rows).map((r) => r.id)).toEqual(['org']);
  });

  it('returns an empty list for someone with no org', () => {
    expect(selectTeamPrimaries([row({ isPrimary: true })])).toEqual([]);
    expect(selectTeamPrimaries([])).toEqual([]);
  });
});

describe('isPendingStaff', () => {
  it('flags both pending variants', () => {
    expect(isPendingStaff(row({ guestType: 'staff-pending' }))).toBe(true);
    expect(isPendingStaff(row({ guestType: 'exhibitor-staff-pending' }))).toBe(true);
  });

  it('does not flag a claimed seat or a plain row', () => {
    expect(isPendingStaff(row({ guestType: 'staff-claimed' }))).toBe(false);
    expect(isPendingStaff(row({ guestType: 'exhibitor-staff-claimed' }))).toBe(false);
    expect(isPendingStaff(row({}))).toBe(false);
  });
});

describe('staffPassLabel', () => {
  it('names the two roster categories', () => {
    expect(staffPassLabel(row({ answers: { staffCategory: 'hall_only' } as any }))).toBe('Hall-Only');
    expect(staffPassLabel(row({ answers: { staffCategory: 'full_access' } as any }))).toBe('Full Congress');
  });

  it('falls back to the ticket type rather than a dash', () => {
    // A delegation registered by an admin has no staffCategory. Showing "—"
    // next to a perfectly valid pass reads as a broken record.
    expect(staffPassLabel(row({ ticketType: 'Exhibit Pass' }))).toBe('Exhibit Pass');
    expect(staffPassLabel(row({ answers: {} as any, ticketType: 'Full Congress' }))).toBe('Full Congress');
  });

  it('only shows a dash when there is genuinely nothing to say', () => {
    expect(staffPassLabel(row({ ticketType: '' }))).toBe('—');
  });
});

// ── Seat quota ──────────────────────────────────────────────────────────────
// Gold is 8 Hall-Only + 4 Full Congress; bronze is 4 + 2.
const org = (patch: Partial<Attendee> = {}): Attendee =>
  row({ id: 'org', isPrimary: true, sponsorTier: 'gold' as any, ...patch });

const seat = (id: string, category?: string, patch: Partial<Attendee> = {}): Attendee =>
  row({ id, isPrimary: false, primaryAttendeeId: 'org', answers: (category ? { staffCategory: category } : {}) as any, ...patch });

describe('quotaForPrimary', () => {
  it('reads the sponsor tier', () => {
    expect(quotaForPrimary(org())).toEqual({ hall_only: 8, full_access: 4 });
    expect(quotaForPrimary(org({ sponsorTier: 'bronze' as any }))).toEqual({ hall_only: 4, full_access: 2 });
  });

  it('prefers the booth when the org is an exhibitor', () => {
    const q = quotaForPrimary(org({ sponsorTier: null, exhibitorBoothType: 'standard' }));
    expect(typeof q.hall_only).toBe('number');
    expect(typeof q.full_access).toBe('number');
  });

  it('grants nothing for a missing or unrecognised booking', () => {
    expect(quotaForPrimary(null)).toEqual({ hall_only: 0, full_access: 0 });
    expect(quotaForPrimary(org({ sponsorTier: 'unobtainium' as any }))).toEqual({ hall_only: 0, full_access: 0 });
  });
});

describe('seatUsage', () => {
  const staff = [
    seat('a', 'full_access'), seat('b', 'full_access'),
    seat('c', 'hall_only'), seat('d'),
  ];

  it('counts each category and leaves uncategorised seats out', () => {
    const u = seatUsage(org(), staff);
    expect(u.used).toEqual({ hall_only: 1, full_access: 2 });
    expect(u.remaining).toEqual({ hall_only: 7, full_access: 2 });
  });

  it('excludes paid extras — those were bought on top of the tier', () => {
    const withExtra = [...staff, seat('e', 'full_access', { isPaidExtra: true })];
    expect(seatUsage(org(), withExtra).used.full_access).toBe(2);
  });

  it('can exclude one seat, for testing a change to that seat', () => {
    expect(seatUsage(org(), staff, { excludeId: 'a' }).used.full_access).toBe(1);
  });
});

describe('canAssignCategory', () => {
  const full = [
    seat('a', 'full_access'), seat('b', 'full_access'),
    seat('c', 'full_access'), seat('d', 'full_access'),
  ];

  it('allows a move while a seat is spare', () => {
    expect(canAssignCategory(org(), full.slice(0, 3), 'x', 'full_access').ok).toBe(true);
  });

  it('refuses once the category is full, and says how to free one', () => {
    const v = canAssignCategory(org(), full, 'x', 'full_access');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Remove someone/i);
    expect(v.reason).toMatch(/4 Full Congress/);
  });

  it('never blocks re-saving someone in the category they already hold', () => {
    // The seat under edit is excluded before counting. Without that, a full
    // roster would make a simple name typo unfixable.
    expect(canAssignCategory(org(), full, 'a', 'full_access').ok).toBe(true);
  });

  it('refuses outright when the booking includes none of that category', () => {
    const noneOrg = org({ sponsorTier: 'unobtainium' as any });
    const v = canAssignCategory(noneOrg, [], 'x', 'full_access');
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/does not include any/i);
  });

  it('lets a full category free up after someone is removed', () => {
    expect(canAssignCategory(org(), full, 'x', 'full_access').ok).toBe(false);
    const afterRemoval = full.slice(0, 3);
    expect(canAssignCategory(org(), afterRemoval, 'x', 'full_access').ok).toBe(true);
  });
});
