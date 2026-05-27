import { describe, it, expect } from 'vitest';
import {
  findPromoCode,
  applyPromoDiscount,
  isFreeAfterPromo,
  describePromo,
} from '../utils/promoCodes';
import type { PromoCode } from '../types';

const SPEAKER: PromoCode = { code: 'SPEAKER2026', type: 'percent', value: 100, appliesGuestType: 'speaker' };
const HALF:    PromoCode = { code: 'HALF',        type: 'percent', value: 50 };
const FIVE:    PromoCode = { code: 'FIVE',        type: 'fixed',   value: 500 };
const OFF:     PromoCode = { code: 'OLD',         type: 'percent', value: 100, enabled: false };

describe('findPromoCode', () => {
  it('matches case-insensitively', () => {
    expect(findPromoCode([SPEAKER], 'speaker2026')?.code).toBe('SPEAKER2026');
    expect(findPromoCode([SPEAKER], 'SPEAKER2026')?.code).toBe('SPEAKER2026');
  });
  it('returns undefined when not found', () => {
    expect(findPromoCode([SPEAKER], 'NOPE')).toBeUndefined();
  });
  it('respects enabled=false', () => {
    expect(findPromoCode([OFF], 'OLD')).toBeUndefined();
  });
  it('handles missing/empty codes safely', () => {
    expect(findPromoCode([], 'X')).toBeUndefined();
    expect(findPromoCode(null, 'X')).toBeUndefined();
    expect(findPromoCode([SPEAKER], '')).toBeUndefined();
    expect(findPromoCode([SPEAKER], null)).toBeUndefined();
  });
  it('trims input', () => {
    expect(findPromoCode([SPEAKER], '  SPEAKER2026  ')?.code).toBe('SPEAKER2026');
  });
});

describe('applyPromoDiscount', () => {
  it('passes subtotal through when no promo', () => {
    expect(applyPromoDiscount(10000, undefined)).toBe(10000);
  });
  it('100% off zeros out the total', () => {
    expect(applyPromoDiscount(50000, SPEAKER)).toBe(0);
  });
  it('50% off halves the total', () => {
    expect(applyPromoDiscount(10000, HALF)).toBe(5000);
  });
  it('fixed amount subtracts in minor units', () => {
    expect(applyPromoDiscount(2000, FIVE)).toBe(1500);
  });
  it('never goes negative', () => {
    expect(applyPromoDiscount(300, FIVE)).toBe(0);
  });
  it('clamps invalid percent values', () => {
    const bad: PromoCode = { code: 'BAD', type: 'percent', value: 200 };
    expect(applyPromoDiscount(10000, bad)).toBe(0); // clamped to 100%
    const neg: PromoCode = { code: 'NEG', type: 'percent', value: -10 };
    expect(applyPromoDiscount(10000, neg)).toBe(10000); // clamped to 0%
  });
});

describe('isFreeAfterPromo', () => {
  it('true when promo zeros out the total', () => {
    expect(isFreeAfterPromo(50000, SPEAKER)).toBe(true);
  });
  it('false when only partially discounted', () => {
    expect(isFreeAfterPromo(10000, HALF)).toBe(false);
  });
  it('false when no promo', () => {
    expect(isFreeAfterPromo(50000, undefined)).toBe(false);
  });
});

describe('describePromo', () => {
  it('formats percent', () => {
    expect(describePromo(HALF)).toBe('50% off');
  });
  it('formats fixed amount with currency', () => {
    expect(describePromo(FIVE, 'USD')).toBe('5.00 USD off');
  });
});
