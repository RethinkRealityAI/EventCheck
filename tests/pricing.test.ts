import { describe, it, expect } from 'vitest';
import {
  resolveBracket,
  resolveTier,
  computeTotal,
  formatPrice,
} from '../utils/pricing';
import type { PricingTemplate } from '../types';

const T: PricingTemplate = {
  id: 't1',
  name: 'GANSID 2026',
  timezone: 'Asia/Kolkata',
  currency: 'USD',
  isActive: true,
  activeBracketOverride: null,
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: 'Asia etc.', countries: ['IN', 'NG', 'BR'] },
    { id: 'tier2', name: 'Tier 2', label: 'US etc.',   countries: ['US', 'CA', 'GB'] },
  ],
  dateBrackets: [
    { id: 'eb',   name: 'Early Bird', startDate: '2026-01-01', endDate: '2026-06-30' },
    { id: 'reg',  name: 'Regular',    startDate: '2026-07-01', endDate: '2026-09-15' },
    { id: 'os',   name: 'On-site',    startDate: '2026-09-16', endDate: '2026-10-25' },
  ],
  categories: [
    {
      id: 'phys', name: 'Physicians',
      prices: {
        tier1: { eb: 17500, reg: 20000, os: 25000 },
        tier2: { eb: 25000, reg: 30000, os: 40000 },
      },
    },
    {
      id: 'stud', name: 'Students',
      prices: {
        tier1: { eb: 5000, reg: 7500, os: 10000 },
        tier2: { eb: 7500, reg: 10000, os: 12500 },
      },
    },
  ],
  addons: [
    { id: 'net', name: 'Networking Reception', description: '', price: 5000 },
  ],
  createdAt: '2026-04-16T00:00:00Z',
  updatedAt: '2026-04-16T00:00:00Z',
};

describe('resolveBracket', () => {
  it('returns Early Bird for a date inside its range', () => {
    expect(resolveBracket(T, new Date('2026-05-01T12:00:00Z'))?.id).toBe('eb');
  });
  it('returns Regular for a date inside its range', () => {
    expect(resolveBracket(T, new Date('2026-08-01T12:00:00Z'))?.id).toBe('reg');
  });
  it('returns On-site for a date inside its range', () => {
    expect(resolveBracket(T, new Date('2026-10-01T12:00:00Z'))?.id).toBe('os');
  });
  it('respects the active bracket override', () => {
    const overridden = { ...T, activeBracketOverride: 'os' };
    expect(resolveBracket(overridden, new Date('2026-05-01T12:00:00Z'))?.id).toBe('os');
  });
  it('returns null when the date falls outside all brackets', () => {
    expect(resolveBracket(T, new Date('2025-11-01T12:00:00Z'))).toBeNull();
  });
});

describe('resolveTier', () => {
  it('finds the tier containing the country', () => {
    expect(resolveTier(T, 'IN')?.id).toBe('tier1');
    expect(resolveTier(T, 'US')?.id).toBe('tier2');
  });
  it('returns the last tier as fallback when country is unclassified', () => {
    expect(resolveTier(T, 'XX')?.id).toBe('tier2');
  });
  it('returns the last tier when countryCode is empty', () => {
    expect(resolveTier(T, '')?.id).toBe('tier2');
  });
});

describe('computeTotal', () => {
  const bracket = T.dateBrackets[0];
  const tier = T.tiers[0];
  it('returns category price + selected add-ons', () => {
    expect(computeTotal(T, 'phys', tier, bracket, ['net'])).toBe(17500 + 5000);
  });
  it('returns category price alone when no add-ons', () => {
    expect(computeTotal(T, 'stud', tier, bracket, [])).toBe(5000);
  });
  it('ignores unknown add-on IDs', () => {
    expect(computeTotal(T, 'stud', tier, bracket, ['not-a-real-id'])).toBe(5000);
  });
  it('returns null when category is unknown', () => {
    expect(computeTotal(T, 'nope', tier, bracket, [])).toBeNull();
  });
  it('returns null when the tier×bracket price is missing', () => {
    const missing = { ...T, categories: [{ id: 'x', name: 'X', prices: {} }] };
    expect(computeTotal(missing, 'x', tier, bracket, [])).toBeNull();
  });
});

describe('formatPrice', () => {
  it('formats USD cents to a dollar string', () => {
    expect(formatPrice(17500, 'USD')).toBe('$175.00');
  });
  it('uses the template currency code', () => {
    expect(formatPrice(17500, 'CAD')).toMatch(/CA\$|CAD/);
  });
});
