import type { Form, FormField, TicketConfig, TicketItem } from '../../types';

// Sponsor tier IDs are the short keys the server-side quota map + client-side
// color/award lookups expect: 'signature' | 'gold' | 'silver' | 'award' | 'scholarship'.
// Prices are informational only — the combined form is payment-free.
const SPONSOR_TIER_ITEMS: TicketItem[] = [
  { id: 'signature',   name: 'Signature Sponsor',           description: 'Top-tier partnership — 16 included registrations.', price: 55000, inventory: 0, maxPerOrder: 1, seats: 16, itemCategory: 'package' },
  { id: 'gold',        name: 'Gold Sponsor',                description: 'Gold-tier partnership — 8 included registrations.',   price: 35000, inventory: 0, maxPerOrder: 1, seats: 8,  itemCategory: 'package' },
  { id: 'silver',      name: 'Silver Sponsor',              description: 'Silver-tier partnership — 8 included registrations.', price: 20000, inventory: 0, maxPerOrder: 1, seats: 8,  itemCategory: 'package' },
  { id: 'award',       name: 'Award of Excellence Sponsor', description: 'Sponsor a specific award category.',                  price: 10000, inventory: 0, maxPerOrder: 1, seats: 0,  itemCategory: 'package' },
  { id: 'scholarship', name: 'Scholarship Sponsor',         description: 'Fund a delegate scholarship.',                         price: 5000,  inventory: 0, maxPerOrder: 1, seats: 0,  itemCategory: 'package' },
];

const TICKET_CONFIG: TicketConfig = {
  currency: 'CAD',
  items: SPONSOR_TIER_ITEMS,
  promoCodes: [],
};

// The combined form's UI is component-driven (see PublicSponsorExhibitorForm).
// The single `ticket` FormField exists purely so StepSponsorTier can read
// `ticketConfig.items` and render the tier dropdown. It is NOT rendered by
// PublicSponsorExhibitorForm itself — the step component pulls from it directly.
const SPONSOR_TIER_FIELD: FormField = {
  id: 'sponsor-tier-packages',
  type: 'ticket',
  label: 'Sponsorship Tier Packages',
  required: false,
  ticketConfig: TICKET_CONFIG,
};

export function buildGansidSponsorExhibitor(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'GANSID Congress 2026 — Sponsor & Exhibitor Registration',
    description: 'Register your organization as a sponsor or exhibitor. Payment is handled externally; this form collects organizational info and staff rosters only.',
    thankYouMessage: 'Thank you. Your staff will receive invitation emails shortly. You can manage your team from your portal dashboard.',
    formType: 'sponsor_exhibitor',
    settings: {
      staffFormId: 'gansid-congress-2026',
    } as any,
    fields: [SPONSOR_TIER_FIELD],
  };
}
