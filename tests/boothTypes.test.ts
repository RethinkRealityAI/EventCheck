import { describe, it, expect } from 'vitest';
import { EXHIBITOR_BOOTH_TYPES, getBoothType, type BoothType } from '../config/formTemplates/boothTypes';

describe('EXHIBITOR_BOOTH_TYPES', () => {
  it('exports exactly 6 booth types', () => {
    expect(EXHIBITOR_BOOTH_TYPES).toHaveLength(6);
  });

  it('has unique IDs', () => {
    const ids = EXHIBITOR_BOOTH_TYPES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every booth has non-empty label + positive quotas', () => {
    EXHIBITOR_BOOTH_TYPES.forEach(b => {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.hallOnlyQuota).toBeGreaterThan(0);
      expect(b.fullAccessQuota).toBeGreaterThan(0);
      expect(['CAD', 'USD']).toContain(b.currency);
    });
  });

  it('getBoothType returns matching booth by id', () => {
    const b = getBoothType('booth_3x3');
    expect(b?.label).toMatch(/3 × 3/);
  });

  it('getBoothType returns undefined for unknown id', () => {
    expect(getBoothType('nope')).toBeUndefined();
  });

  it('non-profit booth has correct USD pricing + reduced quota', () => {
    const b = getBoothType('booth_nonprofit');
    expect(b?.currency).toBe('USD');
    expect(b?.hallOnlyQuota).toBe(2);
    expect(b?.fullAccessQuota).toBe(1);
  });
});
