import { describe, it, expect } from 'vitest';
import { isMultiSeatPurchase, purchasedSeatCount } from '../supabase/functions/_shared/purchaseShape';

// SCAGO's live ticket config — including the trailing space on "Individual ".
const SCAGO_ITEMS = [{ name: 'Individual ', seats: null }, { name: 'Table of 8', seats: 8 }];
const SCAGO_FIELDS = [{ id: 'ticket', type: 'ticket', ticketConfig: { items: SCAGO_ITEMS } }];

describe('purchasedSeatCount', () => {
  it('reads a table purchase', () => {
    expect(purchasedSeatCount('Table of 8 x1', SCAGO_ITEMS)).toBe(8);
  });

  it('matches an item whose configured name has a trailing space', () => {
    // An exact comparison never matches "Individual " and silently counts 1.
    expect(purchasedSeatCount('Individual  x3', SCAGO_ITEMS)).toBe(3);
  });

  it('reads a part with no quantity suffix as one unit', () => {
    expect(purchasedSeatCount('Table of 8', SCAGO_ITEMS)).toBe(8);
  });

  it('counts zero-seat items (adverts, booths) as no seats, not one', () => {
    const items = [{ name: 'Gold Sponsorship', seats: 8 }, { name: 'Full Page Advert', seats: 0 }];
    expect(purchasedSeatCount('Gold Sponsorship x1, Full Page Advert x2', items)).toBe(8);
  });

  it('treats a summary naming nothing in the config as one person', () => {
    expect(purchasedSeatCount('Physicians/Researchers', SCAGO_ITEMS)).toBe(1);
    expect(purchasedSeatCount('Speakers', undefined)).toBe(1);
    expect(purchasedSeatCount('', SCAGO_ITEMS)).toBe(1);
  });
});

describe('isMultiSeatPurchase', () => {
  it('sends the table template to a genuine table purchase', () => {
    expect(isMultiSeatPurchase({ ticket_type: 'Table of 8 x1' }, SCAGO_FIELDS)).toBe(true);
  });

  it('does NOT send it to a single ticket that merely has a free guest linked', () => {
    // A SCAGO "Individual" buyer with a BOGO guest used to be told they bought a table.
    expect(isMultiSeatPurchase({ ticket_type: 'Individual ' }, SCAGO_FIELDS)).toBe(false);
  });

  it('does NOT send it to a GANSID registrant, whatever is linked to them', () => {
    // Every TSCS India booking with a companion, and an invited speaker with a
    // guest place, were all told "Thank you for purchasing a table".
    const gansid = [{ id: 'f_mode', type: 'registration-mode-selector' }, { id: 'f_ticket', type: 'ticket' }];
    expect(isMultiSeatPurchase({ ticket_type: 'Physicians/Researchers', answers: {} }, gansid)).toBe(false);
    expect(isMultiSeatPurchase({ ticket_type: 'Speakers', answers: {} }, gansid)).toBe(false);
  });

  it('does send it to a group-mode registration', () => {
    const gansid = [{ id: 'f_mode', type: 'registration-mode-selector' }];
    expect(isMultiSeatPurchase({ ticket_type: 'Physicians/Researchers', answers: { f_mode: 'group' } }, gansid)).toBe(true);
  });
});
