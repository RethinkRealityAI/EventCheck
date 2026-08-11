import { describe, it, expect } from 'vitest';
import {
  checkPromoCoversCategories,
  promoCoverageMessage,
  promoUsesRemaining,
  promoQuantityMessage,
} from '../utils/promoCodes';
import type { PromoCode } from '../types';

// Mirrors the live GANSID code TSCSB-GC-2026-5.
const scoped: PromoCode = {
  code: 'TSCSB-GC-2026-5',
  type: 'percent',
  value: 100,
  enabled: true,
  totalUsageLimit: 5,
  allowedCategoryIds: ['patient_org', 'patient'],
} as any;

const global_: PromoCode = { code: 'GC26-ANY', type: 'percent', value: 100, enabled: true } as any;

const NAMES: Record<string, string> = {
  patient: 'Patients',
  patient_org: 'Patient Organizations',
  physician: 'Physicians',
  nurse: 'Nurses or Allied Health Professionals',
};
const nameOf = (id: string) => NAMES[id] ?? id;

describe('checkPromoCoversCategories', () => {
  it('passes when every selected category is covered', () => {
    expect(checkPromoCoversCategories(scoped, ['patient', 'patient_org'])).toEqual({ ok: true, uncoveredIds: [] });
  });

  it('flags a GROUP MEMBER whose category is not covered (the reported bug)', () => {
    // Buyer is a patient (valid) but a group member is a physician (not).
    const r = checkPromoCoversCategories(scoped, ['patient', 'physician', 'patient']);
    expect(r.ok).toBe(false);
    expect(r.uncoveredIds).toEqual(['physician']);
  });

  it('dedupes repeated offenders so the message names each once', () => {
    const r = checkPromoCoversCategories(scoped, ['physician', 'nurse', 'physician', 'nurse']);
    expect(r.uncoveredIds).toEqual(['physician', 'nurse']);
  });

  it('ignores blank / not-yet-chosen categories rather than calling them violations', () => {
    expect(checkPromoCoversCategories(scoped, ['patient', '', null, undefined]).ok).toBe(true);
  });

  it('a global promo covers everything', () => {
    expect(checkPromoCoversCategories(global_, ['physician', 'nurse', 'patient']).ok).toBe(true);
  });

  it('no promo applied is never a failure', () => {
    expect(checkPromoCoversCategories(null, ['physician']).ok).toBe(true);
    expect(checkPromoCoversCategories(undefined, ['physician']).ok).toBe(true);
  });
});

describe('promoCoverageMessage', () => {
  it('names the offending categories AND what the code covers', () => {
    const msg = promoCoverageMessage(scoped, ['physician'], nameOf);
    expect(msg).toContain('Physicians');
    expect(msg).toContain('Patient Organizations');
    expect(msg).toContain('Patients');
    expect(msg).toContain('TSCSB-GC-2026-5');
  });

  it('still reads sensibly for a global promo (no allowed-list clause)', () => {
    const msg = promoCoverageMessage(global_, ['physician'], nameOf);
    expect(msg).toContain('Physicians');
    expect(msg).not.toContain('It can only be used for');
  });

  it('falls back gracefully when a category id has no name', () => {
    expect(promoCoverageMessage(scoped, ['mystery'], () => '')).toContain('one or more selected categories');
  });
});

describe('promoUsesRemaining', () => {
  it('returns remaining uses for a limited promo', () => {
    expect(promoUsesRemaining(scoped, 0)).toBe(5);
    expect(promoUsesRemaining(scoped, 3)).toBe(2);
  });

  it('never returns a negative number when over-used', () => {
    expect(promoUsesRemaining(scoped, 9)).toBe(0);
  });

  it('returns null for an unlimited promo', () => {
    expect(promoUsesRemaining(global_, 100)).toBeNull();
  });
});

describe('promoQuantityMessage', () => {
  it('explains the shortfall for a group larger than the remaining uses', () => {
    const msg = promoQuantityMessage(scoped, 2, 5);
    expect(msg).toContain('2 uses left');
    expect(msg).toContain('registering 5 people');
  });

  it('singularises a single remaining use', () => {
    expect(promoQuantityMessage(scoped, 1, 3)).toContain('1 use left');
  });

  it('falls back to the exhausted-code message when nothing remains', () => {
    expect(promoQuantityMessage(scoped, 0, 2)).toContain('reached its maximum use');
  });
});
