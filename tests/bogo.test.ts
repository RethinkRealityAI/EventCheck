import { describe, it, expect } from 'vitest';
import {
  BOGO_ADMIN_CONTACT,
  isBogoEligibleSource,
  isBogoUncommitted,
  getBogoSlotState,
  countAvailableBogoSlots,
  computeBogoPriceCeiling,
  getEligibleBogoCategories,
  isCategoryEligibleForBogo,
  priceAt,
} from '../utils/bogo';
import type { Attendee, Form, PricingTemplate } from '../types';

const TEMPLATE: PricingTemplate = {
  id: 't1',
  name: 'GANSID 2026',
  timezone: 'America/Toronto',
  currency: 'USD',
  isActive: true,
  activeBracketOverride: null,
  tiers: [
    { id: 'tierA', name: 'Tier A', label: 'High income', countries: ['CA', 'US'] },
    { id: 'tierB', name: 'Tier B', label: 'Middle income', countries: ['NG', 'IN'] },
  ],
  dateBrackets: [
    { id: 'eb', name: 'Early Bird', startDate: '2026-01-01', endDate: '2026-06-30' },
  ],
  categories: [
    { id: 'phys', name: 'Physician',
      prices: { tierA: { eb: 50000 }, tierB: { eb: 20000 } } },
    { id: 'comm', name: 'Community',
      prices: { tierA: { eb: 30000 }, tierB: { eb: 10000 } } },
    { id: 'pat',  name: 'Patient',
      prices: { tierA: { eb: 20000 }, tierB: { eb: 8000 } } },
    { id: 'stud', name: 'Student',
      prices: { tierA: { eb: 10000 }, tierB: { eb: 5000 } } },
  ],
  addons: [],
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

const FORM_BOGO_ON: Form = {
  id: 'f1', title: 'Congress', description: '',
  formType: 'event', fields: [], createdAt: '2026-04-01', status: 'active',
  settings: { bogoEnabled: true, pricingTemplateId: 't1' },
};
const FORM_BOGO_OFF: Form = { ...FORM_BOGO_ON, settings: { bogoEnabled: false, pricingTemplateId: 't1' } };

function paid(overrides: Partial<Attendee> = {}): Attendee {
  return {
    id: overrides.id ?? 'paid-1',
    formId: 'f1', formTitle: 'Congress',
    name: 'Dr. Adesola', email: 'a@example.com',
    ticketType: 'Physician', registeredAt: '2026-04-10T00:00:00Z',
    qrPayload: '{}', paymentStatus: 'paid',
    isPrimary: true,
    pricingTemplateId: 't1', pricingTier: 'tierA',
    pricingBracket: 'eb', pricingCategoryId: 'phys',
    userId: 'user-1',
    ...overrides,
  } as Attendee;
}
function free(overrides: Partial<Attendee> = {}): Attendee {
  return {
    id: overrides.id ?? 'free-1',
    formId: 'f1', formTitle: 'Congress',
    name: 'Maya', email: 'maya@example.com',
    ticketType: 'Registration (Free Guest)',
    registeredAt: '2026-04-11T00:00:00Z',
    qrPayload: '{}', paymentStatus: 'free',
    paymentAmount: '0', paymentMethod: 'bogo',
    isPrimary: true, guestType: 'adult',
    isBogoClaim: true, bogoSourceAttendeeId: 'paid-1',
    pricingTemplateId: 't1', pricingTier: 'tierA',
    pricingBracket: 'eb', pricingCategoryId: 'pat',
    ...overrides,
  } as Attendee;
}

describe('BOGO_ADMIN_CONTACT', () => {
  it('is the GANSID admin email', () => {
    expect(BOGO_ADMIN_CONTACT).toBe('admin@inheritedblooddisorders.world');
  });
});

describe('isBogoEligibleSource', () => {
  it('eligible when BOGO is on and the row is a real paid primary', () => {
    expect(isBogoEligibleSource(paid(), FORM_BOGO_ON)).toBe(true);
  });
  it('ineligible when form has BOGO off', () => {
    expect(isBogoEligibleSource(paid(), FORM_BOGO_OFF)).toBe(false);
  });
  it('ineligible for test rows', () => {
    expect(isBogoEligibleSource(paid({ isTest: true }), FORM_BOGO_ON)).toBe(false);
  });
  it('ineligible for BOGO claims (no chaining)', () => {
    expect(isBogoEligibleSource(paid({ isBogoClaim: true }), FORM_BOGO_ON)).toBe(false);
  });
  it('ineligible for donated-seat claims', () => {
    expect(isBogoEligibleSource(paid({ isDonatedSeatClaim: true }), FORM_BOGO_ON)).toBe(false);
  });
  it('ineligible for sponsor/exhibitor staff rows', () => {
    expect(isBogoEligibleSource(paid({ guestType: 'exhibitor-staff-pending' }), FORM_BOGO_ON)).toBe(false);
    expect(isBogoEligibleSource(paid({ guestType: 'exhibitor-staff-claimed' }), FORM_BOGO_ON)).toBe(false);
    expect(isBogoEligibleSource(paid({ guestType: 'staff-pending' }), FORM_BOGO_ON)).toBe(false);
    expect(isBogoEligibleSource(paid({ guestType: 'staff-claimed' }), FORM_BOGO_ON)).toBe(false);
  });
  it('ineligible for speaker rows (free via promo)', () => {
    expect(isBogoEligibleSource(paid({ guestType: 'speaker' }), FORM_BOGO_ON)).toBe(false);
  });
  it('ineligible for any payment_status="free" row (promo waived)', () => {
    expect(isBogoEligibleSource(paid({ paymentStatus: 'free' }), FORM_BOGO_ON)).toBe(false);
  });
  it('eligible for group members with pending-claim or claimed guest types', () => {
    expect(isBogoEligibleSource(paid({ guestType: 'pending-claim' }), FORM_BOGO_ON)).toBe(true);
    expect(isBogoEligibleSource(paid({ guestType: 'claimed' }), FORM_BOGO_ON)).toBe(true);
    expect(isBogoEligibleSource(paid({ guestType: 'adult' }), FORM_BOGO_ON)).toBe(true);
    expect(isBogoEligibleSource(paid({ guestType: 'child' }), FORM_BOGO_ON)).toBe(true);
  });
});

describe('isBogoUncommitted', () => {
  it('uncommitted when no user_id, no check-in, not claimed', () => {
    expect(isBogoUncommitted(free({ userId: null, checkedInAt: null }))).toBe(true);
  });
  it('committed when user_id is set', () => {
    expect(isBogoUncommitted(free({ userId: 'maya-user' }))).toBe(false);
  });
  it('committed when checkedInAt is set', () => {
    expect(isBogoUncommitted(free({ checkedInAt: '2026-09-01T18:00:00Z' }))).toBe(false);
  });
  it('committed when guest_type is "claimed"', () => {
    expect(isBogoUncommitted(free({ guestType: 'claimed' }))).toBe(false);
  });
});

describe('getBogoSlotState', () => {
  it('ineligible for a non-eligible source', () => {
    expect(getBogoSlotState(paid(), [paid()], FORM_BOGO_OFF).kind).toBe('ineligible');
  });
  it('available when no free row references the paid id', () => {
    expect(getBogoSlotState(paid(), [paid()], FORM_BOGO_ON).kind).toBe('available');
  });
  it('inline-sent when a free adult row references it', () => {
    const result = getBogoSlotState(paid(), [paid(), free()], FORM_BOGO_ON);
    expect(result.kind).toBe('inline-sent');
    if (result.kind === 'inline-sent') expect(result.uncommitted).toBe(true);
  });
  it('inline-sent committed when the guest has a userId', () => {
    const result = getBogoSlotState(paid(), [paid(), free({ userId: 'u2' })], FORM_BOGO_ON);
    expect(result.kind).toBe('inline-sent');
    if (result.kind === 'inline-sent') expect(result.uncommitted).toBe(false);
  });
  it('pending-claim-sent when the free row is still pending-claim', () => {
    const result = getBogoSlotState(paid(), [paid(), free({ guestType: 'pending-claim', name: 'pending', email: 'a@example.com' })], FORM_BOGO_ON);
    expect(result.kind).toBe('pending-claim-sent');
  });
  it('claimed once the free row\'s guest_type flips to claimed', () => {
    const result = getBogoSlotState(paid(), [paid(), free({ guestType: 'claimed', userId: 'u2' })], FORM_BOGO_ON);
    expect(result.kind).toBe('claimed');
  });
  it('dismissed rows still count as "slot used" — never returns to available', () => {
    const dismissed = free({ bogoDismissedByPayerAt: '2026-04-12T00:00:00Z' });
    const result = getBogoSlotState(paid(), [paid(), dismissed], FORM_BOGO_ON);
    expect(result.kind).not.toBe('available');
  });
});

describe('countAvailableBogoSlots', () => {
  const f = { f1: FORM_BOGO_ON };
  it('counts paid rows with unused slots', () => {
    const a = paid({ id: 'paid-A' });
    const b = paid({ id: 'paid-B' });
    expect(countAvailableBogoSlots([a, b], [a, b], f)).toBe(2);
  });
  it('excludes paid rows whose slot is already used', () => {
    const a = paid({ id: 'paid-A' });
    const b = paid({ id: 'paid-B' });
    const aFree = free({ id: 'free-A', bogoSourceAttendeeId: 'paid-A' });
    expect(countAvailableBogoSlots([a, b], [a, b, aFree], f)).toBe(1);
  });
  it('skips ineligible rows', () => {
    const test = paid({ id: 'paid-T', isTest: true });
    expect(countAvailableBogoSlots([test], [test], f)).toBe(0);
  });
});

describe('priceAt', () => {
  it('returns the price at a tier+bracket', () => {
    expect(priceAt(TEMPLATE, 'phys', 'tierA', 'eb')).toBe(50000);
    expect(priceAt(TEMPLATE, 'stud', 'tierB', 'eb')).toBe(5000);
  });
  it('returns null for unknown category', () => {
    expect(priceAt(TEMPLATE, 'nope', 'tierA', 'eb')).toBeNull();
  });
});

describe('computeBogoPriceCeiling', () => {
  it('returns the payer\'s category price at their tier+bracket', () => {
    expect(computeBogoPriceCeiling(TEMPLATE, paid())).toBe(50000); // Physician tierA eb
  });
  it('returns null when pricing inputs are missing', () => {
    expect(computeBogoPriceCeiling(TEMPLATE, paid({ pricingCategoryId: null }))).toBeNull();
    expect(computeBogoPriceCeiling(TEMPLATE, paid({ pricingTier: null }))).toBeNull();
    expect(computeBogoPriceCeiling(TEMPLATE, paid({ pricingBracket: null }))).toBeNull();
  });
});

describe('getEligibleBogoCategories', () => {
  it('a Physician (tierA) can bring Physician, Community, Patient, or Student', () => {
    const eligible = getEligibleBogoCategories(TEMPLATE, paid());
    expect(eligible.map(c => c.id).sort()).toEqual(['comm', 'pat', 'phys', 'stud']);
  });
  it('a Student (tierA) can bring only Student', () => {
    const eligible = getEligibleBogoCategories(TEMPLATE, paid({ pricingCategoryId: 'stud' }));
    expect(eligible.map(c => c.id)).toEqual(['stud']);
  });
  it('a Patient (tierA) can bring Patient and Student (not Physician or Community)', () => {
    const eligible = getEligibleBogoCategories(TEMPLATE, paid({ pricingCategoryId: 'pat' }));
    expect(eligible.map(c => c.id).sort()).toEqual(['pat', 'stud']);
  });
  it('always uses payer\'s tier+bracket for comparison, even with cross-tier categories', () => {
    // Comparison is at the payer's tier (tierA), so Physician=50000, Student=10000.
    // Students get $10k, Physicians $50k — Student NOT allowed to bring Physician.
    const eligible = getEligibleBogoCategories(TEMPLATE, paid({ pricingCategoryId: 'stud' }));
    expect(eligible.map(c => c.id)).not.toContain('phys');
  });
});

describe('isCategoryEligibleForBogo', () => {
  it('returns true for an eligible category', () => {
    expect(isCategoryEligibleForBogo(TEMPLATE, paid(), 'pat')).toBe(true);
    expect(isCategoryEligibleForBogo(TEMPLATE, paid(), 'phys')).toBe(true);
  });
  it('returns false for a higher-priced category', () => {
    expect(isCategoryEligibleForBogo(TEMPLATE, paid({ pricingCategoryId: 'stud' }), 'phys')).toBe(false);
  });
  it('returns false for an unknown category', () => {
    expect(isCategoryEligibleForBogo(TEMPLATE, paid(), 'nope')).toBe(false);
  });
});
