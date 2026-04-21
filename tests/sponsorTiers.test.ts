import { describe, it, expect } from 'vitest';
import { SPONSOR_TIERS, getSponsorTier } from '../config/formTemplates/sponsorTiers';

describe('SPONSOR_TIERS', () => {
  it('exports exactly 4 tiers', () => {
    expect(SPONSOR_TIERS).toHaveLength(4);
  });

  it('includes Platinum / Gold / Silver / Bronze in that order', () => {
    expect(SPONSOR_TIERS.map(t => t.id)).toEqual(['platinum', 'gold', 'silver', 'bronze']);
  });

  it('quotas decrease monotonically through tiers', () => {
    for (let i = 1; i < SPONSOR_TIERS.length; i++) {
      expect(SPONSOR_TIERS[i].hallOnlyQuota).toBeLessThan(SPONSOR_TIERS[i - 1].hallOnlyQuota);
      expect(SPONSOR_TIERS[i].fullCongressQuota).toBeLessThanOrEqual(SPONSOR_TIERS[i - 1].fullCongressQuota);
    }
  });

  it('matches the prospectus seat counts', () => {
    expect(getSponsorTier('platinum')).toMatchObject({ hallOnlyQuota: 12, fullCongressQuota: 6 });
    expect(getSponsorTier('gold')).toMatchObject({ hallOnlyQuota: 8, fullCongressQuota: 4 });
    expect(getSponsorTier('silver')).toMatchObject({ hallOnlyQuota: 6, fullCongressQuota: 3 });
    expect(getSponsorTier('bronze')).toMatchObject({ hallOnlyQuota: 4, fullCongressQuota: 2 });
  });

  it('returns undefined for unknown tier', () => {
    expect(getSponsorTier('platinum-plus')).toBeUndefined();
  });
});
