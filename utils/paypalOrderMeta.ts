// utils/paypalOrderMeta.ts
//
// Builds additive PayPal order metadata (description, invoice_id, items,
// breakdown) so the PayPal dashboard shows the event/ticket/sponsor-package a
// user paid for.
//
// Contract: every builder returns an object that can be spread onto a PayPal
// purchase_unit WITHOUT changing `amount.value`. If the built items don't sum
// exactly to what PayPal expects (within half a cent), the builder drops
// `items` + `breakdown` and returns description + invoice_id only. This
// guarantees PayPal's server-side validation never rejects an order because
// of a metadata math mismatch — checkout keeps working exactly as before.

import type {
  Form,
  PricingTemplate,
  TicketItem,
} from '../types';
import { resolveBracket, resolveTier } from './pricing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PayPalItem {
  name: string;
  quantity: string;
  unit_amount: { currency_code: string; value: string };
  category?: 'PHYSICAL_GOODS' | 'DIGITAL_GOODS' | 'DONATION';
  description?: string;
}

export interface PayPalBreakdown {
  item_total: { currency_code: string; value: string };
  discount?: { currency_code: string; value: string };
}

export interface PayPalOrderExtras {
  description: string;
  invoice_id: string;
  items?: PayPalItem[];
  breakdown?: PayPalBreakdown;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// PayPal limits `name` to 127 chars and `description` to 127 chars per item.
const truncate = (s: string, max = 127): string =>
  s.length <= max ? s : s.slice(0, max - 1) + '…';

const toMoney = (dollars: number): string => dollars.toFixed(2);

// Sum an items array's item_total in dollars, using the 2-decimal rounded
// strings we'll actually send to PayPal (so our guard check matches what
// PayPal's server-side check will see).
const sumItems = (items: PayPalItem[]): number =>
  items.reduce((acc, it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unit_amount.value) || 0;
    return acc + qty * unit;
  }, 0);

// Apply the math-safety guard. PayPal requires:
//   amount.value == item_total - discount
// Both sides are 2-decimal. We check that our built items obey that within
// half a cent; if not, drop items so the request keeps the minimal legal
// shape (just description + invoice_id + amount.value).
const withGuard = (
  items: PayPalItem[],
  expectedTotal: number,
  currency: string,
  base: { description: string; invoice_id: string },
  discount = 0,
): PayPalOrderExtras => {
  if (items.length === 0) return base;
  const itemTotal = sumItems(items);
  const derived = itemTotal - discount;
  if (Math.abs(derived - expectedTotal) > 0.005) return base;

  const breakdown: PayPalBreakdown = {
    item_total: { currency_code: currency, value: toMoney(itemTotal) },
  };
  if (discount > 0) {
    breakdown.discount = { currency_code: currency, value: toMoney(discount) };
  }
  return { ...base, items, breakdown };
};

// Generate a simple, unique, human-readable invoice_id. PayPal requires this
// to be unique per merchant; the timestamp + random suffix gives us plenty.
// Max length is 127 chars — we stay well under.
export function makeInvoiceId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  // Sanitize FIRST, then fall back to 'order' if nothing valid remains,
  // so an all-invalid input like "!!!" doesn't produce a leading dash.
  const sanitized = (prefix ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32);
  const safePrefix = sanitized || 'order';
  return truncate(`${safePrefix}-${ts}-${rand}`, 120);
}

const normalizedTitle = (form: Form): string => (form.title || '').trim();
const titlePrefix = (form: Form): string => normalizedTitle(form) || 'Event';

const eventDescription = (form: Form): string => {
  const t = normalizedTitle(form);
  return truncate(t ? `${t} — Registration` : 'Event Registration');
};

// ---------------------------------------------------------------------------
// Builder: static ticket flow (TicketItem[] × ticketQuantities)
// Used by PublicRegistration when no pricingTemplate is attached.
// paymentTotal, item.price, and discountAmount are all in MAJOR units
// (dollars), matching existing amount.value.
// ---------------------------------------------------------------------------

export function buildStaticTicketExtras(params: {
  form: Form;
  ticketItems: TicketItem[];
  ticketQuantities: Record<string, number>;
  currency: string;
  paymentTotal: number;
  sitePrefix: string;
  discountAmount?: number;
}): PayPalOrderExtras {
  const {
    form,
    ticketItems,
    ticketQuantities,
    currency,
    paymentTotal,
    sitePrefix,
    discountAmount = 0,
  } = params;

  const base = {
    description: eventDescription(form),
    invoice_id: makeInvoiceId(sitePrefix),
  };

  const prefix = titlePrefix(form);
  const items: PayPalItem[] = [];
  for (const it of ticketItems) {
    const qty = ticketQuantities[it.id] || 0;
    // Skip zero-qty and zero-price lines. Zero-price lines would trip some
    // PayPal integrations; they contribute 0 to the sum so removing them
    // preserves math.
    if (qty <= 0 || it.price <= 0) continue;
    items.push({
      name: truncate(normalizedTitle(form) ? `${prefix} — ${it.name}` : it.name),
      quantity: String(qty),
      unit_amount: { currency_code: currency, value: toMoney(it.price) },
      category: 'DIGITAL_GOODS',
    });
  }

  const discount = Math.max(0, discountAmount);
  return withGuard(items, paymentTotal, currency, base, discount);
}

// ---------------------------------------------------------------------------
// Builder: dynamic single-person pricing flow
// dynamicTotal, category fee, addon prices are in MINOR units (cents).
// amount.value is computed as dynamicTotal/100. We convert to dollars here so
// items.unit_amount.value matches amount.value units.
// ---------------------------------------------------------------------------

export function buildDynamicSingleExtras(params: {
  form: Form;
  template: PricingTemplate;
  countryCode: string;
  categoryId: string;
  addonIds: string[];
  dynamicTotalCents: number;
  sitePrefix: string;
  /** Pre-tax promo discount in minor units (cents) for PayPal breakdown. */
  discountCents?: number;
}): PayPalOrderExtras {
  const { form, template, countryCode, categoryId, addonIds, dynamicTotalCents, sitePrefix, discountCents } = params;

  const base = {
    description: eventDescription(form),
    invoice_id: makeInvoiceId(sitePrefix),
  };

  const bracket = resolveBracket(template, new Date());
  const tier = resolveTier(template, countryCode);
  const category = template.categories.find(c => c.id === categoryId);
  if (!bracket || !tier || !category) return base;

  const categoryFee = category.prices?.[tier.id]?.[bracket.id];
  if (typeof categoryFee !== 'number') return base;

  const prefix = titlePrefix(form);
  const items: PayPalItem[] = [];
  if (categoryFee > 0) {
    items.push({
      name: truncate(`${prefix} — ${category.name} (${tier.label}, ${bracket.name})`),
      quantity: '1',
      unit_amount: { currency_code: template.currency, value: toMoney(categoryFee / 100) },
      category: 'DIGITAL_GOODS',
    });
  }

  for (const id of addonIds) {
    const addon = template.addons.find(a => a.id === id);
    if (!addon || addon.price <= 0) continue;
    items.push({
      name: truncate(`${prefix} — ${addon.name}`),
      quantity: '1',
      unit_amount: { currency_code: template.currency, value: toMoney(addon.price / 100) },
      category: 'DIGITAL_GOODS',
    });
  }

  const discount = (discountCents || 0) / 100;
  return withGuard(items, dynamicTotalCents / 100, template.currency, base, discount);
}

// ---------------------------------------------------------------------------
// Builder: dynamic group pricing flow
// Input includes the purchaser (index 0) + each additional registrant.
// Each registrant becomes one line item labelled with their category + tier.
// groupTotalCents is in MINOR units; we convert to dollars for PayPal.
// ---------------------------------------------------------------------------

export interface GroupMemberInput {
  countryCode: string;
  categoryId: string;
  addonIds: string[];
  displayName?: string; // "You" for purchaser, or the registrant's name
}

export function buildDynamicGroupExtras(params: {
  form: Form;
  template: PricingTemplate;
  members: GroupMemberInput[];
  groupTotalCents: number;
  sitePrefix: string;
  /** Pre-tax promo discount in minor units (cents) for PayPal breakdown. */
  discountCents?: number;
}): PayPalOrderExtras {
  const { form, template, members, groupTotalCents, sitePrefix, discountCents } = params;
  const base = {
    description: eventDescription(form),
    invoice_id: makeInvoiceId(sitePrefix),
  };

  const bracket = resolveBracket(template, new Date());
  if (!bracket) return base;

  const prefix = titlePrefix(form);
  const items: PayPalItem[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const tier = resolveTier(template, m.countryCode);
    const category = template.categories.find(c => c.id === m.categoryId);
    if (!tier || !category) return base;
    const fee = category.prices?.[tier.id]?.[bracket.id];
    if (typeof fee !== 'number') return base;

    const who = m.displayName?.trim() || (i === 0 ? 'Registrant 1' : `Registrant ${i + 1}`);
    if (fee > 0) {
      items.push({
        name: truncate(`${prefix} — ${category.name} (${tier.label}, ${bracket.name}) — ${who}`),
        quantity: '1',
        unit_amount: { currency_code: template.currency, value: toMoney(fee / 100) },
        category: 'DIGITAL_GOODS',
      });
    }

    for (const id of m.addonIds) {
      const addon = template.addons.find(a => a.id === id);
      if (!addon) return base;
      if (addon.price <= 0) continue;
      items.push({
        name: truncate(`${prefix} — ${addon.name} — ${who}`),
        quantity: '1',
        unit_amount: { currency_code: template.currency, value: toMoney(addon.price / 100) },
        category: 'DIGITAL_GOODS',
      });
    }
  }

  const discount = (discountCents || 0) / 100;
  return withGuard(items, groupTotalCents / 100, template.currency, base, discount);
}

// ---------------------------------------------------------------------------
// Builder: sponsor flow
// Items are TicketItems with major-unit prices already. If an HST amount is
// present, it's added as its own line item so items sum to totalWithHst and
// the dashboard matches what the sponsor sees on their receipt.
// ---------------------------------------------------------------------------

export function buildSponsorExtras(params: {
  form: Form;
  selectedItems: Array<{ item: TicketItem; qty: number }>;
  hstAmount: number; // 0 if no HST
  totalWithHst: number; // the amount.value being sent to PayPal
  currency: string;
  sitePrefix: string;
}): PayPalOrderExtras {
  const { form, selectedItems, hstAmount, totalWithHst, currency, sitePrefix } = params;
  const base = {
    description: truncate(normalizedTitle(form) ? `Sponsorship — ${normalizedTitle(form)}` : 'Sponsorship'),
    invoice_id: makeInvoiceId(sitePrefix),
  };

  const prefix = titlePrefix(form);
  const items: PayPalItem[] = [];
  for (const { item, qty } of selectedItems) {
    if (qty <= 0 || item.price <= 0) continue;
    items.push({
      name: truncate(normalizedTitle(form) ? `${prefix} — ${item.name}` : item.name),
      quantity: String(qty),
      unit_amount: { currency_code: currency, value: toMoney(item.price) },
      category: 'DIGITAL_GOODS',
    });
  }

  if (hstAmount > 0) {
    items.push({
      name: 'HST',
      quantity: '1',
      unit_amount: { currency_code: currency, value: toMoney(hstAmount) },
      category: 'DIGITAL_GOODS',
    });
  }

  return withGuard(items, totalWithHst, currency, base);
}
