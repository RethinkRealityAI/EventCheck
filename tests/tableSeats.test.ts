import { describe, expect, it } from 'vitest';
import { checkTableGuestCapacity, computePurchasedSeatTotal, isTableGuestRow } from '../utils/tableSeats';
import type { Attendee, Form } from '../types';

const basePrimary = (overrides: Partial<Attendee> = {}): Attendee => ({
  id: 'p1',
  formId: 'f1',
  formTitle: 'Gala',
  name: 'Buyer',
  email: 'buyer@example.com',
  ticketType: 'Table for 8 x1',
  registeredAt: '2026-01-01',
  checkedInAt: null,
  qrPayload: '{}',
  isPrimary: true,
  ...overrides,
});

const formWithTable: Form = {
  id: 'f1',
  title: 'Gala',
  description: '',
  formType: 'event',
  status: 'active',
  showInPortal: false,
  createdAt: '',
  fields: [{
    id: 'ticket',
    type: 'ticket',
    label: 'Tickets',
    required: true,
    ticketConfig: {
      currency: 'CAD',
      promoCodes: [],
      items: [{ id: 't1', name: 'Table for 8', price: 1000, seats: 8, inventory: 100, maxPerOrder: 5 }],
    },
  }],
  settings: {},
};

describe('tableSeats', () => {
  it('computes purchased seat total from ticket type summary', () => {
    expect(computePurchasedSeatTotal(basePrimary(), formWithTable)).toBe(8);
  });

  it('blocks adding guests when at capacity', () => {
    const primary = basePrimary();
    const guests: Attendee[] = Array.from({ length: 7 }, (_, i) => ({
      id: `g${i}`,
      formId: 'f1',
      formTitle: 'Gala',
      name: `Guest ${i}`,
      email: 'g@example.com',
      ticketType: 'Guest',
      registeredAt: '2026-01-01',
      checkedInAt: null,
      qrPayload: '{}',
      guestType: 'adult' as const,
    }));
    const result = checkTableGuestCapacity(primary, guests, formWithTable);
    expect(result.allowed).toBe(false);
    expect(result.maxSeats).toBe(8);
    expect(result.currentSeats).toBe(8);
  });

  it('allows table guest rows but excludes staff types', () => {
    expect(isTableGuestRow({ guestType: 'adult' } as Attendee)).toBe(true);
    expect(isTableGuestRow({ guestType: 'staff-pending' } as Attendee)).toBe(false);
  });
});
