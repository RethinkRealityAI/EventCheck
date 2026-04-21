import type { Form } from '../../types';

// Combined GANSID Sponsor & Exhibitor registration template.
//
// Component-driven (fields: []). Sponsor tiers live in sponsorTiers.ts; booth
// types live in boothTypes.ts. Neither is data-driven from the form record —
// StepSponsorTier + StepExhibitorBooth read their respective config modules
// directly, same pattern as the legacy PublicExhibitorForm.
//
// `settings.staffFormId` points at the companion event form (gansid-congress-2026)
// that collects per-staff personal details (dietary, emergency, consents). Staff
// rows written by verify-payment's sponsorExhibitorSubmission branch inherit that
// form_id so the claim link lands on the right personal-details form.
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
