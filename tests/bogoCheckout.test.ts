import { describe, expect, it } from 'vitest';
import {
  buildBogoClaimsForCheckout,
  countIncompleteInlineBogoSlots,
  isCompleteInlineBogoSlot,
} from '../utils/bogoCheckout';

describe('bogoCheckout', () => {
  it('treats claim_link as complete without guest fields', () => {
    expect(isCompleteInlineBogoSlot({
      mode: 'claim_link', guestName: '', guestEmail: '', categoryId: '',
    })).toBe(false);
    const { claims, omittedIncomplete } = buildBogoClaimsForCheckout([{
      mode: 'claim_link', guestName: '', guestEmail: '', categoryId: '',
    }]);
    expect(claims).toEqual([{ paidIndex: 0, mode: 'claim_link', categoryId: null }]);
    expect(omittedIncomplete).toBe(0);
  });

  it('omits incomplete inline slots instead of sending them', () => {
    const slots = [
      { mode: 'inline' as const, guestName: 'A', guestEmail: 'bad', categoryId: 'phys' },
      { mode: 'inline' as const, guestName: 'B', guestEmail: 'b@x.com', categoryId: 'comm' },
    ];
    expect(countIncompleteInlineBogoSlots(slots)).toBe(1);
    const { claims, omittedIncomplete } = buildBogoClaimsForCheckout(slots);
    expect(omittedIncomplete).toBe(1);
    expect(claims).toHaveLength(1);
    expect(claims[0].guestEmail).toBe('b@x.com');
  });
});
