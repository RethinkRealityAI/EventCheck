// GANSID Congress 2026 sponsor tiers. Parallel structure to EXHIBITOR_BOOTH_TYPES —
// each tier carries Hall-Only + Full-Congress registration quotas that cap the
// sponsor's staff roster exactly the same way booth types cap exhibitor staff.
//
// Values match the GANSID sponsorship prospectus (see the tiers table screenshot
// shared on 2026-04-21):
//   Platinum : 12 Hall-Only + 6 Full Congress
//   Gold     :  8 Hall-Only + 4 Full Congress
//   Silver   :  6 Hall-Only + 3 Full Congress
//   Bronze   :  4 Hall-Only + 2 Full Congress
//
// Pricing, benefits, recognition copy, etc. live in the sponsorship prospectus PDF
// and are not modeled here — the form is registration-only, no payment.

export interface SponsorTier {
  id: string;
  name: string;
  /** Tailwind class for the dropdown color dot + selected-state accents. */
  colorClass: string;
  hallOnlyQuota: number;
  fullCongressQuota: number;
  description?: string;
}

export const SPONSOR_TIERS: ReadonlyArray<SponsorTier> = [
  {
    id: 'platinum',
    name: 'Platinum',
    colorClass: 'bg-slate-300',
    hallOnlyQuota: 12,
    fullCongressQuota: 6,
  },
  {
    id: 'gold',
    name: 'Gold',
    colorClass: 'bg-amber-500',
    hallOnlyQuota: 8,
    fullCongressQuota: 4,
  },
  {
    id: 'silver',
    name: 'Silver',
    colorClass: 'bg-slate-400',
    hallOnlyQuota: 6,
    fullCongressQuota: 3,
  },
  {
    id: 'bronze',
    name: 'Bronze',
    colorClass: 'bg-orange-700',
    hallOnlyQuota: 4,
    fullCongressQuota: 2,
  },
];

export function getSponsorTier(id: string): SponsorTier | undefined {
  return SPONSOR_TIERS.find(t => t.id === id);
}

export type SponsorTierId = typeof SPONSOR_TIERS[number]['id'];
