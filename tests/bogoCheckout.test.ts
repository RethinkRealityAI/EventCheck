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

  it('passes through a trimmed guestCountry on complete inline slots', () => {
    const { claims } = buildBogoClaimsForCheckout([
      { mode: 'inline', guestName: 'A', guestEmail: 'a@x.com', categoryId: 'phys', guestCountry: '  IN  ' },
    ]);
    expect(claims[0].guestCountry).toBe('IN');
  });

  it('defaults guestCountry to null when omitted or blank', () => {
    const { claims } = buildBogoClaimsForCheckout([
      { mode: 'inline', guestName: 'A', guestEmail: 'a@x.com', categoryId: 'phys' },
      { mode: 'inline', guestName: 'B', guestEmail: 'b@x.com', categoryId: 'phys', guestCountry: '   ' },
    ]);
    expect(claims[0].guestCountry).toBeNull();
    expect(claims[1].guestCountry).toBeNull();
  });

  it('does not require guestCountry to consider an inline slot complete', () => {
    expect(isCompleteInlineBogoSlot({
      mode: 'inline', guestName: 'A', guestEmail: 'a@x.com', categoryId: 'phys',
    })).toBe(true);
  });
});
