import { describe, it, expect } from 'vitest';
import { isPromoActive, promoColors, shouldShowForCategory } from '../utils/pricingPromo';
import type { PricingPromoConfig } from '../types';

const base: PricingPromoConfig = {
  enabled: true,
  label: 'Early Bird',
  colorPreset: 'save-green',
  promoPeriodId: 'early',
  comparePeriodId: 'regular',
  categories: 'all',
};

describe('isPromoActive', () => {
  it('false when disabled', () => {
    expect(isPromoActive({ ...base, enabled: false }, new Date('2026-01-01'))).toBe(false);
  });
  it('true when enabled and no endDate', () => {
    expect(isPromoActive(base, new Date('2026-01-01'))).toBe(true);
  });
  it('false after endDate', () => {
    expect(isPromoActive({ ...base, endDate: '2026-06-30' }, new Date('2026-07-01'))).toBe(false);
  });
  it('true before endDate', () => {
    expect(isPromoActive({ ...base, endDate: '2026-06-30' }, new Date('2026-06-01'))).toBe(true);
  });
});

describe('shouldShowForCategory', () => {
  it('all → always true', () => {
    expect(shouldShowForCategory(base, 'cat1')).toBe(true);
  });
  it('list → membership', () => {
    expect(shouldShowForCategory({ ...base, categories: ['cat1'] }, 'cat1')).toBe(true);
    expect(shouldShowForCategory({ ...base, categories: ['cat1'] }, 'cat2')).toBe(false);
  });
});

describe('promoColors', () => {
  it('preset returns classes', () => {
    expect(promoColors(base).length).toBeGreaterThan(0);
  });
  it('custom returns inline style token', () => {
    const c = promoColors({ ...base, colorPreset: 'custom', customBg: '#111', customText: '#fff' });
    expect(c).toContain('#111');
  });
});
