import { describe, it, expect } from 'vitest';
import { createSponsorForm } from '../components/Sponsors/createSponsorForm';

describe('createSponsorForm', () => {
  const form = createSponsorForm();

  it('sets formType to sponsor', () => {
    expect(form.formType).toBe('sponsor');
  });

  it('starts as active', () => {
    expect(form.status).toBe('active');
  });

  it('has 7 company-info fields + 1 ticket field', () => {
    const nonTicketFields = form.fields.filter(f => f.type !== 'ticket');
    const ticketFields = form.fields.filter(f => f.type === 'ticket');
    expect(nonTicketFields).toHaveLength(7);
    expect(ticketFields).toHaveLength(1);
  });

  it('contains all 5 tier/package items with correct prices', () => {
    const ticket = form.fields.find(f => f.type === 'ticket');
    const items = ticket?.ticketConfig?.items ?? [];
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    expect(byId['tier-signature']?.price).toBe(55000);
    expect(byId['tier-gold']?.price).toBe(35000);
    expect(byId['tier-silver']?.price).toBe(20000);
    expect(byId['tier-award']?.price).toBe(10000);
    expect(byId['item-scholarship']?.price).toBe(2500);
  });

  it('tier-signature has 16 seats, gold/silver have 8, award/scholarship have 0', () => {
    const ticket = form.fields.find(f => f.type === 'ticket');
    const items = ticket?.ticketConfig?.items ?? [];
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    expect(byId['tier-signature']?.seats).toBe(16);
    expect(byId['tier-gold']?.seats).toBe(8);
    expect(byId['tier-silver']?.seats).toBe(8);
    expect(byId['tier-award']?.seats).toBe(0);
    expect(byId['item-scholarship']?.seats).toBe(0);
  });

  it('contains all 7 ad items with correct prices', () => {
    const ticket = form.fields.find(f => f.type === 'ticket');
    const items = ticket?.ticketConfig?.items ?? [];
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    expect(byId['ad-double-spread']?.price).toBe(2050);
    expect(byId['ad-back-page']?.price).toBe(1500);
    expect(byId['ad-inside-front']?.price).toBe(1300);
    expect(byId['ad-inside-back']?.price).toBe(1300);
    expect(byId['ad-full-page']?.price).toBe(1200);
    expect(byId['ad-half-page']?.price).toBe(650);
    expect(byId['ad-quarter-page']?.price).toBe(500);
  });

  it('contains 2 booth items with HST note in description', () => {
    const ticket = form.fields.find(f => f.type === 'ticket');
    const items = ticket?.ticketConfig?.items ?? [];
    const full = items.find(i => i.id === 'booth-full');
    const half = items.find(i => i.id === 'booth-half');
    expect(full?.price).toBe(1000);
    expect(half?.price).toBe(500);
    expect(full?.description).toContain('HST');
    expect(half?.description).toContain('HST');
  });

  it('categorizes items correctly with itemCategory', () => {
    const ticket = form.fields.find(f => f.type === 'ticket');
    const items = ticket?.ticketConfig?.items ?? [];
    const byCat = items.reduce<Record<string, number>>((acc, i) => {
      const c = i.itemCategory || 'uncategorized';
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {});
    expect(byCat['package']).toBe(4);
    expect(byCat['scholarship']).toBe(1);
    expect(byCat['ad']).toBe(7);
    expect(byCat['booth']).toBe(2);
  });

  it('generates a unique id each call', () => {
    const a = createSponsorForm();
    const b = createSponsorForm();
    expect(a.id).not.toBe(b.id);
  });
});
