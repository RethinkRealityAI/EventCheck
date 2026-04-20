import { describe, it, expect } from 'vitest';
import type { Form, PricingTemplate, TicketItem } from '../types';
import {
  buildStaticTicketExtras,
  buildDynamicSingleExtras,
  buildDynamicGroupExtras,
  buildSponsorExtras,
  makeInvoiceId,
} from '../utils/paypalOrderMeta';

const FORM: Form = {
  id: 'form-abc-123',
  title: 'GANSID Congress 2026',
  description: '',
  status: 'published',
  fields: [],
  settings: {},
  thankYouMessage: '',
  createdAt: '',
  updatedAt: '',
} as unknown as Form;

const UNTITLED_FORM: Form = { ...FORM, title: '' } as unknown as Form;
const WHITESPACE_FORM: Form = { ...FORM, title: '   ' } as unknown as Form;

const TEMPLATE: PricingTemplate = {
  id: 't1',
  name: 'GANSID 2026',
  timezone: 'UTC',
  currency: 'CAD',
  isActive: true,
  activeBracketOverride: 'eb',
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: 'Asia', countries: ['IN', 'NG'] },
    { id: 'tier2', name: 'Tier 2', label: 'US/CA', countries: ['US', 'CA'] },
  ],
  dateBrackets: [
    { id: 'eb', name: 'Early Bird', startDate: '2026-01-01', endDate: '2026-06-30' },
  ],
  categories: [
    {
      id: 'phys',
      name: 'Physicians',
      prices: {
        tier1: { eb: 17500 },
        tier2: { eb: 25000 },
      },
    },
    {
      id: 'stud',
      name: 'Students',
      prices: {
        tier1: { eb: 5000 },
        tier2: { eb: 7500 },
      },
    },
    {
      id: 'free',
      name: 'Complimentary',
      prices: {
        tier1: { eb: 0 },
        tier2: { eb: 0 },
      },
    },
  ],
  addons: [
    { id: 'net', name: 'Networking Reception', description: '', price: 5000 },
    { id: 'freebie', name: 'Welcome Gift', description: '', price: 0 },
  ],
  createdAt: '',
  updatedAt: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sum = (items: { quantity: string; unit_amount: { value: string } }[] | undefined) =>
  (items ?? []).reduce((acc, it) => acc + Number(it.quantity) * Number(it.unit_amount.value), 0);

// ---------------------------------------------------------------------------
// Static ticket flow
// ---------------------------------------------------------------------------

describe('buildStaticTicketExtras', () => {
  const tickets: TicketItem[] = [
    { id: 'gen', name: 'General Admission', price: 50, inventory: 0, maxPerOrder: 10 },
    { id: 'vip', name: 'VIP', price: 150, inventory: 0, maxPerOrder: 10 },
  ];

  it('emits items + breakdown whose sum matches paymentTotal', () => {
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 2, vip: 1 },
      currency: 'USD',
      paymentTotal: 250,
      sitePrefix: 'scago',
    });
    expect(extras.description).toBeTruthy();
    expect(extras.invoice_id).toBeTruthy();
    expect(extras.items).toHaveLength(2);
    expect(sum(extras.items)).toBeCloseTo(250, 2);
    expect(extras.breakdown?.item_total.value).toBe('250.00');
    expect(extras.breakdown?.discount).toBeUndefined();
  });

  it('omits zero-qty lines', () => {
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 1, vip: 0 },
      currency: 'USD',
      paymentTotal: 50,
      sitePrefix: 'scago',
    });
    expect(extras.items).toHaveLength(1);
    expect(extras.items?.[0].name).toContain('General Admission');
  });

  it('filters out free ($0) ticket items to avoid PayPal 0.00 unit_amount quirks', () => {
    const mixed: TicketItem[] = [
      ...tickets,
      { id: 'free', name: 'Free RSVP', price: 0, inventory: 0, maxPerOrder: 1 },
    ];
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: mixed,
      ticketQuantities: { gen: 1, vip: 0, free: 1 },
      currency: 'USD',
      paymentTotal: 50, // free line contributes 0
      sitePrefix: 'scago',
    });
    // Only the General Admission line should be present
    expect(extras.items).toHaveLength(1);
    expect(extras.items?.[0].name).toContain('General Admission');
    // Sum still matches paymentTotal, guard passes
    expect(sum(extras.items)).toBeCloseTo(50, 2);
  });

  it('handles promo discount by emitting breakdown.item_total + breakdown.discount', () => {
    // $100 General + $150 VIP = $250; 20% off = $50 discount; pay $200
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 2, vip: 1 }, // 100 + 150 = 250
      currency: 'USD',
      paymentTotal: 200,
      sitePrefix: 'scago',
      discountAmount: 50,
    });
    expect(extras.items).toHaveLength(2);
    expect(extras.breakdown?.item_total.value).toBe('250.00');
    expect(extras.breakdown?.discount?.value).toBe('50.00');
    // item_total - discount must equal paymentTotal
    expect(Number(extras.breakdown?.item_total.value) - Number(extras.breakdown?.discount?.value))
      .toBeCloseTo(200, 2);
  });

  it('drops items when discount math does not reconcile to paymentTotal', () => {
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 2, vip: 1 },
      currency: 'USD',
      paymentTotal: 180, // expected: 250 - discount; discount=50 → 200, not 180
      sitePrefix: 'scago',
      discountAmount: 50,
    });
    expect(extras.items).toBeUndefined();
    expect(extras.breakdown).toBeUndefined();
  });

  it('drops items when paymentTotal does not equal sum (no discount provided)', () => {
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 2, vip: 1 },
      currency: 'USD',
      paymentTotal: 200, // items sum to 250, discount not passed
      sitePrefix: 'scago',
    });
    expect(extras.items).toBeUndefined();
  });

  it('handles missing form title without a leading separator in item name', () => {
    const extras = buildStaticTicketExtras({
      form: UNTITLED_FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 1 },
      currency: 'USD',
      paymentTotal: 50,
      sitePrefix: 'scago',
    });
    expect(extras.items?.[0].name).toBe('General Admission');
    expect(extras.items?.[0].name).not.toMatch(/^[^A-Za-z0-9]/);
    expect(extras.description).toBe('Event Registration');
  });

  it('treats whitespace-only title as missing', () => {
    const extras = buildStaticTicketExtras({
      form: WHITESPACE_FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 1 },
      currency: 'USD',
      paymentTotal: 50,
      sitePrefix: 'scago',
    });
    expect(extras.items?.[0].name).toBe('General Admission');
    expect(extras.description).toBe('Event Registration');
  });

  it('clamps negative discountAmount to 0', () => {
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { gen: 2, vip: 1 },
      currency: 'USD',
      paymentTotal: 250,
      sitePrefix: 'scago',
      discountAmount: -10, // defensive: should be treated as 0
    });
    expect(extras.items).toHaveLength(2);
    expect(extras.breakdown?.discount).toBeUndefined();
  });

  it('handles items with decimal prices that sum cleanly', () => {
    const decimalTickets: TicketItem[] = [
      { id: 'a', name: 'Nineteen Ninety-Nine', price: 19.99, inventory: 0, maxPerOrder: 10 },
    ];
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: decimalTickets,
      ticketQuantities: { a: 3 },
      currency: 'USD',
      paymentTotal: 59.97,
      sitePrefix: 'scago',
    });
    expect(extras.items).toHaveLength(1);
    expect(extras.breakdown?.item_total.value).toBe('59.97');
  });
});

// ---------------------------------------------------------------------------
// Dynamic single flow (cents input → dollars in items)
// ---------------------------------------------------------------------------

describe('buildDynamicSingleExtras', () => {
  it('emits one category line + one line per addon, sum == dynamicTotalCents/100', () => {
    const extras = buildDynamicSingleExtras({
      form: FORM,
      template: TEMPLATE,
      countryCode: 'US',
      categoryId: 'phys',
      addonIds: ['net'],
      dynamicTotalCents: 30000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toHaveLength(2);
    expect(sum(extras.items)).toBeCloseTo(300, 2);
    expect(extras.breakdown?.item_total.value).toBe('300.00');
  });

  it('drops items when expected total does not match', () => {
    const extras = buildDynamicSingleExtras({
      form: FORM,
      template: TEMPLATE,
      countryCode: 'US',
      categoryId: 'phys',
      addonIds: ['net'],
      dynamicTotalCents: 40000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toBeUndefined();
  });

  it('falls back to description-only when no matching bracket', () => {
    const noBracketTemplate: PricingTemplate = {
      ...TEMPLATE,
      activeBracketOverride: null,
      dateBrackets: [
        { id: 'eb', name: 'EB', startDate: '2099-01-01', endDate: '2099-12-31' },
      ],
    };
    const extras = buildDynamicSingleExtras({
      form: FORM,
      template: noBracketTemplate,
      countryCode: 'US',
      categoryId: 'phys',
      addonIds: [],
      dynamicTotalCents: 25000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toBeUndefined();
  });

  it('falls back to desc-only when categoryId is missing (empty string)', () => {
    const extras = buildDynamicSingleExtras({
      form: FORM,
      template: TEMPLATE,
      countryCode: 'US',
      categoryId: '',
      addonIds: [],
      dynamicTotalCents: 0,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toBeUndefined();
  });

  it('skips zero-price addons and zero-price categories', () => {
    // Complimentary category = $0; no items should be generated
    const extras = buildDynamicSingleExtras({
      form: FORM,
      template: TEMPLATE,
      countryCode: 'US',
      categoryId: 'free',
      addonIds: ['freebie'],
      dynamicTotalCents: 0,
      sitePrefix: 'gansid',
    });
    // Empty items → guard returns base
    expect(extras.items).toBeUndefined();
    expect(extras.description).toBeTruthy();
    expect(extras.invoice_id).toBeTruthy();
  });

  it('includes category but filters zero-price addon in mixed case', () => {
    const extras = buildDynamicSingleExtras({
      form: FORM,
      template: TEMPLATE,
      countryCode: 'US',
      categoryId: 'phys',
      addonIds: ['freebie'],
      dynamicTotalCents: 25000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toHaveLength(1);
    expect(extras.items?.[0].name).toContain('Physicians');
  });
});

// ---------------------------------------------------------------------------
// Dynamic group flow
// ---------------------------------------------------------------------------

describe('buildDynamicGroupExtras', () => {
  it('emits one line per registrant with name, items sum matches group total', () => {
    const extras = buildDynamicGroupExtras({
      form: FORM,
      template: TEMPLATE,
      members: [
        { countryCode: 'US', categoryId: 'phys', addonIds: [], displayName: 'You' },
        { countryCode: 'IN', categoryId: 'stud', addonIds: [], displayName: 'Jane Doe' },
      ],
      groupTotalCents: 25000 + 5000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toHaveLength(2);
    expect(sum(extras.items)).toBeCloseTo(300, 2);
    expect(extras.items?.[0].name).toContain('You');
    expect(extras.items?.[1].name).toContain('Jane Doe');
  });

  it('falls back to positional labels when displayName missing', () => {
    const extras = buildDynamicGroupExtras({
      form: FORM,
      template: TEMPLATE,
      members: [
        { countryCode: 'US', categoryId: 'phys', addonIds: [] },
        { countryCode: 'IN', categoryId: 'stud', addonIds: [] },
      ],
      groupTotalCents: 25000 + 5000,
      sitePrefix: 'gansid',
    });
    expect(extras.items?.[0].name).toContain('Registrant 1');
    expect(extras.items?.[1].name).toContain('Registrant 2');
  });

  it('drops items when any member has an unresolvable category', () => {
    const extras = buildDynamicGroupExtras({
      form: FORM,
      template: TEMPLATE,
      members: [
        { countryCode: 'US', categoryId: 'phys', addonIds: [] },
        { countryCode: 'IN', categoryId: 'nonexistent', addonIds: [] },
      ],
      groupTotalCents: 25000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toBeUndefined();
  });

  it('includes addons per registrant', () => {
    const extras = buildDynamicGroupExtras({
      form: FORM,
      template: TEMPLATE,
      members: [
        { countryCode: 'US', categoryId: 'phys', addonIds: ['net'], displayName: 'You' },
      ],
      groupTotalCents: 25000 + 5000,
      sitePrefix: 'gansid',
    });
    expect(extras.items).toHaveLength(2);
    expect(extras.items?.some(i => i.name.includes('Networking'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sponsor flow
// ---------------------------------------------------------------------------

describe('buildSponsorExtras', () => {
  const signature: TicketItem = {
    id: 'tier-signature',
    name: 'Signature Sponsor',
    price: 10000,
    inventory: 0,
    maxPerOrder: 1,
    itemCategory: 'package',
  };
  const booth: TicketItem = {
    id: 'booth-10',
    name: 'Booth 10 m²',
    price: 2000,
    inventory: 0,
    maxPerOrder: 5,
    itemCategory: 'booth',
  };
  const freeItem: TicketItem = {
    id: 'free-thing',
    name: 'Free Add-on',
    price: 0,
    inventory: 0,
    maxPerOrder: 5,
    itemCategory: 'ad',
  };

  it('emits one line per item and includes HST as a line when > 0', () => {
    const extras = buildSponsorExtras({
      form: FORM,
      selectedItems: [
        { item: signature, qty: 1 },
        { item: booth, qty: 1 },
      ],
      hstAmount: 260,
      totalWithHst: 10000 + 2000 + 260,
      currency: 'CAD',
      sitePrefix: 'scago',
    });
    expect(extras.items).toHaveLength(3);
    expect(extras.items?.some(i => i.name === 'HST')).toBe(true);
    expect(sum(extras.items)).toBeCloseTo(12260, 2);
    expect(extras.breakdown?.item_total.value).toBe('12260.00');
  });

  it('omits HST line when hstAmount is 0', () => {
    const extras = buildSponsorExtras({
      form: FORM,
      selectedItems: [{ item: signature, qty: 1 }],
      hstAmount: 0,
      totalWithHst: 10000,
      currency: 'CAD',
      sitePrefix: 'scago',
    });
    expect(extras.items).toHaveLength(1);
    expect(extras.items?.every(i => i.name !== 'HST')).toBe(true);
  });

  it('filters out zero-price items from the sponsor purchase', () => {
    const extras = buildSponsorExtras({
      form: FORM,
      selectedItems: [
        { item: signature, qty: 1 },
        { item: freeItem, qty: 1 }, // should be filtered
      ],
      hstAmount: 0,
      totalWithHst: 10000,
      currency: 'CAD',
      sitePrefix: 'scago',
    });
    expect(extras.items).toHaveLength(1);
    expect(extras.items?.[0].name).toContain('Signature Sponsor');
  });

  it('handles fractional HST precisely (13% of $333)', () => {
    const boothSubtotal = 333;
    const hst = boothSubtotal * 0.13; // 43.29000000000001 in floats
    const total = boothSubtotal + hst;
    const extras = buildSponsorExtras({
      form: FORM,
      selectedItems: [
        { item: { ...booth, price: boothSubtotal }, qty: 1 },
      ],
      hstAmount: hst,
      totalWithHst: total,
      currency: 'CAD',
      sitePrefix: 'scago',
    });
    expect(extras.items).toHaveLength(2);
    expect(extras.breakdown?.item_total.value).toBe('376.29');
  });

  it('drops items if math mismatches', () => {
    const extras = buildSponsorExtras({
      form: FORM,
      selectedItems: [{ item: signature, qty: 1 }],
      hstAmount: 0,
      totalWithHst: 9000,
      currency: 'CAD',
      sitePrefix: 'scago',
    });
    expect(extras.items).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// makeInvoiceId
// ---------------------------------------------------------------------------

describe('makeInvoiceId', () => {
  it('produces a sanitized id within PayPal length limits', () => {
    const id = makeInvoiceId('gansid');
    expect(id.length).toBeLessThanOrEqual(127);
    expect(id).toMatch(/^gansid-/);
  });

  it('strips disallowed characters from the prefix', () => {
    const id = makeInvoiceId('sca go!@#');
    expect(id).toMatch(/^scago-/);
  });

  it('returns distinct ids across rapid successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(makeInvoiceId('scago'));
    // 500 rapid calls should produce 500 unique ids given ts + random suffix
    expect(ids.size).toBe(500);
  });

  it('falls back to "order" prefix when prefix is empty or all-invalid', () => {
    const id = makeInvoiceId('!!!');
    expect(id).toMatch(/^order-/);
  });
});

// ---------------------------------------------------------------------------
// Description consistency
// ---------------------------------------------------------------------------

describe('description and invoice_id always present', () => {
  const tickets: TicketItem[] = [
    { id: 'a', name: 'A', price: 10, inventory: 0, maxPerOrder: 10 },
  ];

  it('static: always present even on fallback', () => {
    const extras = buildStaticTicketExtras({
      form: FORM,
      ticketItems: tickets,
      ticketQuantities: { a: 1 },
      currency: 'USD',
      paymentTotal: 999, // forces fallback
      sitePrefix: 'scago',
    });
    expect(extras.description).toBeTruthy();
    expect(extras.invoice_id).toBeTruthy();
    expect(extras.items).toBeUndefined();
  });

  it('sponsor: always present even on fallback', () => {
    const extras = buildSponsorExtras({
      form: FORM,
      selectedItems: [{
        item: { id: 'x', name: 'X', price: 10, inventory: 0, maxPerOrder: 1 },
        qty: 1,
      }],
      hstAmount: 0,
      totalWithHst: 999,
      currency: 'CAD',
      sitePrefix: 'scago',
    });
    expect(extras.description).toBeTruthy();
    expect(extras.invoice_id).toBeTruthy();
    expect(extras.items).toBeUndefined();
  });
});
