import { describe, it, expect } from 'vitest';
import { computeGroupTotal, type GroupMemberPricingInput } from '../utils/groupPricing';
import type { PricingTemplate } from '../types';

const T: PricingTemplate = {
  id: 't1', name: 'GANSID 2026', timezone: 'UTC', currency: 'USD',
  isActive: true, activeBracketOverride: null,
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: '', countries: ['IN'] },
    { id: 'tier2', name: 'Tier 2', label: '', countries: ['US'] },
  ],
  dateBrackets: [
    { id: 'eb', name: 'Early Bird', startDate: '2026-01-01', endDate: '2026-12-31' },
  ],
  categories: [
    { id: 'phys', name: 'Physicians',
      prices: { tier1: { eb: 17500 }, tier2: { eb: 25000 } } },
    { id: 'stud', name: 'Students',
      prices: { tier1: { eb: 5000 }, tier2: { eb: 7500 } } },
  ],
  addons: [{ id: 'net', name: 'Networking', description: '', price: 5000 }],
  createdAt: '', updatedAt: '',
};

describe('computeGroupTotal', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('sums per-person prices correctly for a mixed group', () => {
    const members: GroupMemberPricingInput[] = [
      { countryCode: 'IN', categoryId: 'phys', addonIds: [] },
      { countryCode: 'IN', categoryId: 'stud', addonIds: [] },
      { countryCode: 'US', categoryId: 'phys', addonIds: ['net'] },
    ];
    const result = computeGroupTotal(T, members, now);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.total).toBe(52500);
    expect(result.perPerson.length).toBe(3);
    expect(result.perPerson[0].cents).toBe(17500);
    expect(result.perPerson[1].cents).toBe(5000);
    expect(result.perPerson[2].cents).toBe(30000);
  });

  it('returns not-ok if any member has unresolvable pricing', () => {
    const members: GroupMemberPricingInput[] = [
      { countryCode: 'IN', categoryId: 'phys', addonIds: [] },
      { countryCode: 'IN', categoryId: 'nonexistent', addonIds: [] },
    ];
    const result = computeGroupTotal(T, members, now);
    expect(result.ok).toBe(false);
    if (result.ok === true) throw new Error('unreachable');
    expect(result.error).toMatch(/category/i);
  });

  it('falls back unclassified country to the last tier', () => {
    const members: GroupMemberPricingInput[] = [
      { countryCode: 'XX', categoryId: 'phys', addonIds: [] },
    ];
    const result = computeGroupTotal(T, members, now);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.total).toBe(25000);
    expect(result.perPerson[0].tierId).toBe('tier2');
  });
});
