import type { Form } from '../../types';

export interface ExhibitorTier {
  id: string;
  name: string;
  hallOnlyQuota: number;
  fullCongressQuota: number;
  boothSize: string;
}

export const EXHIBITOR_TIERS: ReadonlyArray<ExhibitorTier> = [
  { id: 'platinum', name: 'Platinum', hallOnlyQuota: 12, fullCongressQuota: 6, boothSize: '18 m²' },
  { id: 'gold',     name: 'Gold',     hallOnlyQuota: 8,  fullCongressQuota: 4, boothSize: '9 m²' },
  { id: 'silver',   name: 'Silver',   hallOnlyQuota: 6,  fullCongressQuota: 3, boothSize: '9 m²' },
  { id: 'bronze',   name: 'Bronze',   hallOnlyQuota: 4,  fullCongressQuota: 2, boothSize: '—' },
];

export function getExhibitorTier(id: string): ExhibitorTier | undefined {
  return EXHIBITOR_TIERS.find(t => t.id === id);
}

export function buildGansidExhibitor(): Omit<Form, 'id' | 'status' | 'createdAt'> {
  return {
    title: 'GANSID Congress 2026 Exhibitor Registration',
    description: 'Exhibitor registration for organizations. Payment is handled externally.',
    thankYouMessage: 'Thank you for registering! Your staff will receive invitation emails.',
    formType: 'exhibitor',
    settings: {
      staffFormId: 'gansid-congress-2026',
    } as any,
    fields: [],
  };
}
