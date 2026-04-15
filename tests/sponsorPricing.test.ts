import { describe, it, expect } from 'vitest';
import { SponsorItem } from '../types';

/**
 * Replicates the HST-on-booth-only pricing logic from PublicSponsorForm
 * and the verify-payment edge function. Kept as a pure helper here for
 * test coverage.
 */
function computeSponsorTotal(items: SponsorItem[], hstRate = 0.13): { subtotal: number; hst: number; total: number } {
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const boothSubtotal = items.filter(i => i.type === 'booth').reduce((s, i) => s + i.subtotal, 0);
  const hst = boothSubtotal * hstRate;
  return { subtotal, hst, total: subtotal + hst };
}

describe('HST is applied only to booth items', () => {
  it('charges HST on booth subtotal only', () => {
    const items: SponsorItem[] = [
      { type: 'package', key: 'tier-gold', label: 'Gold', qty: 1, unitPrice: 35000, subtotal: 35000 },
      { type: 'booth', key: 'booth-full', label: 'Full Booth', qty: 1, unitPrice: 1000, subtotal: 1000 },
    ];
    const { subtotal, hst, total } = computeSponsorTotal(items);
    expect(subtotal).toBe(36000);
    expect(hst).toBeCloseTo(130, 5);  // 13% of 1000
    expect(total).toBeCloseTo(36130, 5);
  });

  it('no HST when no booth items', () => {
    const items: SponsorItem[] = [
      { type: 'package', key: 'tier-gold', label: 'Gold', qty: 1, unitPrice: 35000, subtotal: 35000 },
      { type: 'ad', key: 'ad-full-page', label: 'Full Page', qty: 1, unitPrice: 1200, subtotal: 1200 },
      { type: 'scholarship', key: 'item-scholarship', label: 'Scholarship', qty: 2, unitPrice: 2500, subtotal: 5000 },
    ];
    const { hst, total, subtotal } = computeSponsorTotal(items);
    expect(hst).toBe(0);
    expect(subtotal).toBe(41200);
    expect(total).toBe(41200);
  });

  it('respects a custom HST rate', () => {
    const items: SponsorItem[] = [
      { type: 'booth', key: 'booth-full', label: 'Full Booth', qty: 1, unitPrice: 1000, subtotal: 1000 },
    ];
    const { hst, total } = computeSponsorTotal(items, 0.15);
    expect(hst).toBeCloseTo(150, 5);
    expect(total).toBeCloseTo(1150, 5);
  });

  it('HST applies to multiple booth items combined', () => {
    const items: SponsorItem[] = [
      { type: 'booth', key: 'booth-full', label: 'Full', qty: 1, unitPrice: 1000, subtotal: 1000 },
      { type: 'booth', key: 'booth-half', label: 'Half', qty: 1, unitPrice: 500, subtotal: 500 },
    ];
    const { hst, total } = computeSponsorTotal(items);
    expect(hst).toBeCloseTo(195, 5);  // 13% of 1500
    expect(total).toBeCloseTo(1695, 5);
  });

  it('zero items → zero everything', () => {
    const { subtotal, hst, total } = computeSponsorTotal([]);
    expect(subtotal).toBe(0);
    expect(hst).toBe(0);
    expect(total).toBe(0);
  });
});
