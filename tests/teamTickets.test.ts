import { describe, it, expect } from 'vitest';
import {
  isTeamPrimary,
  selectTeamPrimaries,
  isPendingStaff,
  staffPassLabel,
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
