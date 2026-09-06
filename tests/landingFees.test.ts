import { describe, it, expect } from 'vitest';
import { LANDING_DEFAULTS } from '../components/Portal/content/landingDefaults';

// The fees table is three loosely-coupled pieces: a list of period columns, a
// price per period on every category row, and a promo block naming two of the
// periods by id. Nothing in the types ties them together, so a column edit that
// touches one and not the others compiles, passes review and renders wrong.
//
// That happened on 2026-09-05. Retiring the expired "Promo" column left
// pricingPromo.promoPeriodId pointing at 'early', a period that no longer
// existed — harmless only because the promo happened to be disabled. Had it
// been on, the banner would have compared against nothing.
//
// These tests are about the shape holding together, not the numbers. Prices are
// edited in the CMS by design and must stay free to change; a test asserting
// specific amounts would fail every time someone legitimately repriced.

const { fees, pricingPromo } = LANDING_DEFAULTS;

describe('landing fees table', () => {
  it('has at least one period and one tier', () => {
    expect(fees.periods.length).toBeGreaterThan(0);
    expect(fees.tiers.length).toBeGreaterThan(0);
  });

  it('gives every period a unique id', () => {
    const ids = fees.periods.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices every category row for every period, and nothing else', () => {
    // A row carrying a stale key (a removed column) renders nowhere but keeps
    // the old price alive in the data; a row missing a key renders blank in a
    // column the header still advertises. Both are invisible in review.
    const periodIds = fees.periods.map((p) => p.id).sort();
    for (const tier of fees.tiers) {
      for (const row of tier.rows) {
        const priceKeys = Object.keys(row).filter((k) => k !== 'category').sort();
        expect(priceKeys, `${tier.id} / ${row.category}`).toEqual(periodIds);
        for (const id of periodIds) {
          expect(typeof (row as any)[id], `${tier.id} / ${row.category} / ${id}`).toBe('number');
        }
      }
    }
  });

  it('offers the same categories in every tier', () => {
    // The table is rendered as one row per category across tiers; a category
    // present in Tier 1 but not Tier 2 silently drops out for half the world.
    const [first, ...rest] = fees.tiers.map((t) => t.rows.map((r) => r.category));
    for (const categories of rest) {
      expect(categories).toEqual(first);
    }
  });

  it('points pricingPromo at periods that exist', () => {
    // The exact bug this file was written for. Both ids are resolved with
    // `.find()` at render time, so a dangling one is `undefined` and the promo
    // silently compares against nothing.
    const ids = fees.periods.map((p) => p.id);
    expect(ids).toContain(pricingPromo.promoPeriodId);
    expect(ids).toContain(pricingPromo.comparePeriodId);
  });

  it('does not compare a period against itself', () => {
    // A promo whose "before" and "after" are the same column always shows a
    // saving of zero, which reads as a broken banner rather than no promo.
    expect(pricingPromo.promoPeriodId).not.toBe(pricingPromo.comparePeriodId);
  });

  it('labels every period and tier', () => {
    for (const p of fees.periods) expect(p.label.trim()).not.toBe('');
    for (const t of fees.tiers) expect(t.label.trim()).not.toBe('');
  });
});
