import { Form, FormField, TicketItem } from '../../types';

export const createSponsorForm = (): Form => {
  const id = crypto.randomUUID();

  const tierBenefits = {
    signature: [
      '2 complimentary tables (16 tickets)',
      'Inside back cover advert + logo on magazine front cover',
      '30-second commercial on event screen',
      'Recognition as sponsor of Medical Award of Excellence',
      'Includes 4 Sunday Afolabi scholarship grants',
      '10×10 booth space (optional)',
    ],
    gold: [
      '1 complimentary table of 8',
      'Full page advert (inside)',
      'Sponsor of Nursing or Humanitarian Award',
      '5×10 booth space',
      'Includes 2 Sunday Afolabi scholarship grants',
    ],
    silver: [
      '1 complimentary table of 8',
      '½ page advert',
      'Sponsor of one bronze-list award (Allied Health, Community, Legislative, Tribute, Media, or Volunteer)',
      'Table exhibition space',
    ],
    award: [
      'Sponsor of one award category',
      'Logo and listing in magazine and event screen',
      'Optional presentation of grant at the Gala',
    ],
    scholarship: [
      'Sponsor one Sunday Afolabi scholarship ($2,500 each)',
      '$2,000 to student, $300 complimentary tickets, $200 admin',
      'Logo and listing in magazine and event screen',
    ],
  };

  const tickets: TicketItem[] = [
    { id: 'tier-signature', name: 'Signature Gala Sponsor', description: 'Top-tier partnership', price: 55000, inventory: 0, maxPerOrder: 1, seats: 16, itemCategory: 'package', benefits: tierBenefits.signature },
    { id: 'tier-gold', name: 'Gold Sponsorship', description: 'Gold-tier partnership', price: 35000, inventory: 0, maxPerOrder: 1, seats: 8, itemCategory: 'package', benefits: tierBenefits.gold },
    { id: 'tier-silver', name: 'Silver Sponsorship', description: 'Silver-tier partnership', price: 20000, inventory: 0, maxPerOrder: 1, seats: 8, itemCategory: 'package', benefits: tierBenefits.silver },
    { id: 'tier-award', name: 'Award of Excellence Sponsorship', description: 'Sponsor a specific award', price: 10000, inventory: 0, maxPerOrder: 1, seats: 0, itemCategory: 'package', benefits: tierBenefits.award },
    { id: 'item-scholarship', name: 'Sunday Afolabi Scholarship', description: 'Each scholarship supports one student', price: 2500, inventory: 0, maxPerOrder: 20, seats: 0, itemCategory: 'scholarship', benefits: tierBenefits.scholarship },
    { id: 'ad-double-spread', name: 'Double Spread Advert', price: 2050, inventory: 0, maxPerOrder: 2, seats: 0, itemCategory: 'ad' },
    { id: 'ad-back-page', name: 'Back Page Advert', price: 1500, inventory: 1, maxPerOrder: 1, seats: 0, itemCategory: 'ad' },
    { id: 'ad-inside-front', name: 'Inside Front Page Advert', price: 1300, inventory: 1, maxPerOrder: 1, seats: 0, itemCategory: 'ad' },
    { id: 'ad-inside-back', name: 'Inside Back Page Advert', price: 1300, inventory: 1, maxPerOrder: 1, seats: 0, itemCategory: 'ad' },
    { id: 'ad-full-page', name: 'Full Page Advert', price: 1200, inventory: 0, maxPerOrder: 5, seats: 0, itemCategory: 'ad' },
    { id: 'ad-half-page', name: 'Half Page Advert', price: 650, inventory: 0, maxPerOrder: 5, seats: 0, itemCategory: 'ad' },
    { id: 'ad-quarter-page', name: 'Quarter Page Advert', price: 500, inventory: 0, maxPerOrder: 5, seats: 0, itemCategory: 'ad' },
    { id: 'booth-full', name: 'Full Booth Space', description: '10×10 booth (+ HST)', price: 1000, inventory: 0, maxPerOrder: 1, seats: 0, itemCategory: 'booth' },
    { id: 'booth-half', name: 'Half Booth Space', description: 'Half booth (+ HST)', price: 500, inventory: 0, maxPerOrder: 1, seats: 0, itemCategory: 'booth' },
  ];

  const fields: FormField[] = [
    { id: 'company-org', type: 'text', label: 'Organization Name', required: true },
    { id: 'company-contact-name', type: 'text', label: 'Contact Name', required: true },
    { id: 'company-contact-title', type: 'text', label: 'Contact Title', required: false },
    { id: 'company-email', type: 'email', label: 'Email Address', required: true },
    { id: 'company-phone', type: 'phone', label: 'Phone', required: false },
    { id: 'company-address', type: 'address', label: 'Mailing Address', required: false },
    { id: 'company-website', type: 'text', label: 'Website', required: false },
    {
      id: 'sponsor-items',
      type: 'ticket',
      label: 'Sponsorship Selection',
      required: true,
      ticketConfig: {
        currency: 'CAD',
        items: tickets,
        promoCodes: [],
      },
    },
  ];

  return {
    id,
    title: 'Sponsor the Hope Gala & Awards 2026',
    description: 'Partner with SCAGO to support the Hope Gala & Awards 2026 on June 13, 2026 at Renaissance By the Creek, Mississauga.',
    formType: 'sponsor',
    createdAt: new Date().toISOString(),
    status: 'active',
    fields,
    settings: {
      submitButtonText: 'Submit Sponsorship',
      successTitle: 'Thank you for your sponsorship!',
      formAccentColor: '#C8262A',
    },
  };
};
