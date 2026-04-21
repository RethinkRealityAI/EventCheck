import type { Form } from '../../types';

export function buildGansidSponsorExhibitor(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'GANSID Congress 2026 — Sponsor & Exhibitor Registration',
    description: 'Register your organization as a sponsor or exhibitor. Payment is handled externally; this form collects organizational info and staff rosters only.',
    thankYouMessage: 'Thank you. Your staff will receive invitation emails shortly. You can manage your team from your portal dashboard.',
    formType: 'sponsor_exhibitor',
    settings: {
      staffFormId: 'gansid-congress-2026',
    } as any,
    fields: [],
  };
}
