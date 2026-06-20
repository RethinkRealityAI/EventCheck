import { describe, it, expect } from 'vitest';
import {
  findPromoCode,
  applyPromoDiscount,
  applyPromoToPricing,
  isFreeAfterPromo,
  describePromo,
  promoAppliedMessage,
  DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE,
  isSpeakerRegistrationCategory,
  categoryRequiresPromoCode,
  isPromoGlobal,
  isPromoAllowedForCategory,
  getPromoUsageLimit,
  isPromoUsageLimitReached,
  getPromoTotalUsageLimit,
  isPromoTotalUsageLimitReached,
  promoUsageLimitCategories,
  anyCategoryRequiresPromoCode,
  formHasEnabledPromoCodes,
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

describe('applyPromoToPricing', () => {
  const REG_ONLY: PromoCode = { code: 'REG10', type: 'percent', value: 10, appliesTo: 'registration_only' };

  it('discounts overall total when appliesTo is all (default)', () => {
    expect(applyPromoToPricing(10000, 2000, HALF)).toBe(6000);
  });
  it('discounts registration fee only when appliesTo is registration_only', () => {
    expect(applyPromoToPricing(10000, 2000, REG_ONLY)).toBe(11000);
  });
  it('registration_only 100% off leaves add-ons payable', () => {
    const fullReg: PromoCode = { code: 'FREE', type: 'percent', value: 100, appliesTo: 'registration_only' };
    expect(applyPromoToPricing(50000, 3000, fullReg)).toBe(3000);
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

describe('promoAppliedMessage', () => {
  it('uses custom appliedMessage when set', () => {
    expect(promoAppliedMessage({ ...SPEAKER, appliedMessage: 'VIP discount active' })).toBe('VIP discount active');
  });
  it('defaults speaker codes to the standard speaker message', () => {
    expect(promoAppliedMessage(SPEAKER)).toBe(DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE);
  });
  it('falls back to code label for generic promos', () => {
    expect(promoAppliedMessage(HALF)).toBe('Promo code applied: HALF');
  });
});

describe('isSpeakerRegistrationCategory', () => {
  it('matches Speaker category names', () => {
    expect(isSpeakerRegistrationCategory('Speaker')).toBe(true);
    expect(isSpeakerRegistrationCategory('Industry Speaker Pass')).toBe(true);
  });
  it('does not match physician or industry partner', () => {
    expect(isSpeakerRegistrationCategory('Physician')).toBe(false);
    expect(isSpeakerRegistrationCategory('Industry Partner')).toBe(false);
  });
});

describe('categoryRequiresPromoCode', () => {
  it('true when requiresPromoCode flag is set', () => {
    expect(categoryRequiresPromoCode({ name: 'Presenter', requiresPromoCode: true })).toBe(true);
  });
  it('true for legacy speaker-named categories', () => {
    expect(categoryRequiresPromoCode({ name: 'Speaker' })).toBe(true);
  });
  it('false for standard categories', () => {
    expect(categoryRequiresPromoCode({ name: 'Physician' })).toBe(false);
  });
});

describe('promo category scope + usage limits', () => {
  const SCOPED: PromoCode = {
    code: 'STUDENT50',
    type: 'percent',
    value: 50,
    allowedCategoryIds: ['stud'],
  };
  const LIMITED: PromoCode = {
    code: 'SPEAKER2026',
    type: 'percent',
    value: 100,
    allowedCategoryIds: ['speaker'],
    usageLimits: { speaker: 25 },
    appliesGuestType: 'speaker',
  };
  const CATS = [
    { id: 'speaker', name: 'Speaker' },
    { id: 'stud', name: 'Student' },
    { id: 'md', name: 'Physician' },
  ];

  it('treats missing allowedCategoryIds as global', () => {
    expect(isPromoGlobal(SPEAKER)).toBe(true);
    expect(isPromoAllowedForCategory(SPEAKER, 'anything')).toBe(true);
  });
  it('restricts scoped promos to allowed categories', () => {
    expect(isPromoGlobal(SCOPED)).toBe(false);
    expect(isPromoAllowedForCategory(SCOPED, 'stud')).toBe(true);
    expect(isPromoAllowedForCategory(SCOPED, 'md')).toBe(false);
  });
  it('reads per-category usage limits', () => {
    expect(getPromoUsageLimit(LIMITED, 'speaker')).toBe(25);
    expect(getPromoUsageLimit(LIMITED, 'md')).toBeNull();
  });
  it('detects when usage limit is reached', () => {
    expect(isPromoUsageLimitReached(LIMITED, 'speaker', 24)).toBe(false);
    expect(isPromoUsageLimitReached(LIMITED, 'speaker', 25)).toBe(true);
  });
  it('lists categories for the usage-limit editor', () => {
    expect(promoUsageLimitCategories(SPEAKER, CATS).length).toBe(3);
    expect(promoUsageLimitCategories(SCOPED, CATS).map(c => c.id)).toEqual(['stud']);
  });
});

describe('getPromoTotalUsageLimit', () => {
  it('returns the limit when set to a positive integer', () => {
    const p: PromoCode = { code: 'BULK50', type: 'percent', value: 20, totalUsageLimit: 50 };
    expect(getPromoTotalUsageLimit(p)).toBe(50);
  });
  it('returns null when totalUsageLimit is absent', () => {
    expect(getPromoTotalUsageLimit(HALF)).toBeNull();
  });
  it('returns null when totalUsageLimit is 0', () => {
    const p: PromoCode = { code: 'ZERO', type: 'percent', value: 10, totalUsageLimit: 0 };
    expect(getPromoTotalUsageLimit(p)).toBeNull();
  });
  it('returns null when totalUsageLimit is negative', () => {
    const p: PromoCode = { code: 'NEG', type: 'percent', value: 10, totalUsageLimit: -5 };
    expect(getPromoTotalUsageLimit(p)).toBeNull();
  });
});

describe('isPromoTotalUsageLimitReached', () => {
  const CAPPED: PromoCode = { code: 'CAP10', type: 'percent', value: 100, totalUsageLimit: 10 };
  const UNCAPPED: PromoCode = { code: 'OPEN', type: 'percent', value: 50 };

  it('false when count is below the limit', () => {
    expect(isPromoTotalUsageLimitReached(CAPPED, 9)).toBe(false);
  });
  it('true when count equals the limit', () => {
    expect(isPromoTotalUsageLimitReached(CAPPED, 10)).toBe(true);
  });
  it('true when count exceeds the limit', () => {
    expect(isPromoTotalUsageLimitReached(CAPPED, 11)).toBe(true);
  });
  it('false when no totalUsageLimit is configured', () => {
    expect(isPromoTotalUsageLimitReached(UNCAPPED, 9999)).toBe(false);
  });
  it('coexists with per-category limits independently', () => {
    const BOTH: PromoCode = {
      code: 'BOTH',
      type: 'percent',
      value: 20,
      totalUsageLimit: 50,
      usageLimits: { physician: 20 },
    };
    expect(getPromoTotalUsageLimit(BOTH)).toBe(50);
    expect(getPromoUsageLimit(BOTH, 'physician')).toBe(20);
    expect(isPromoTotalUsageLimitReached(BOTH, 49)).toBe(false);
    expect(isPromoTotalUsageLimitReached(BOTH, 50)).toBe(true);
    expect(isPromoUsageLimitReached(BOTH, 'physician', 19)).toBe(false);
    expect(isPromoUsageLimitReached(BOTH, 'physician', 20)).toBe(true);
  });
});

describe('anyCategoryRequiresPromoCode', () => {
  const TPL = {
    categories: [
      { id: 'sp', name: 'Speaker', requiresPromoCode: true, prices: {} },
      { id: 'md', name: 'Physician', prices: {} },
    ],
  };
  it('true when any selected id is promo-required', () => {
    expect(anyCategoryRequiresPromoCode(TPL, ['md', 'sp'])).toBe(true);
    expect(anyCategoryRequiresPromoCode(TPL, ['md'])).toBe(false);
  });
});

describe('formHasEnabledPromoCodes', () => {
  it('true when dynamic promos exist', () => {
    expect(formHasEnabledPromoCodes([SPEAKER], null)).toBe(true);
  });
  it('false when all disabled or empty', () => {
    expect(formHasEnabledPromoCodes([{ ...SPEAKER, enabled: false }], null)).toBe(false);
    expect(formHasEnabledPromoCodes([], [])).toBe(false);
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
