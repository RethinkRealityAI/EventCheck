export interface BoothType {
  id: string;
  label: string;
  priceDisplay: string;
  currency: 'CAD' | 'USD';
  hallOnlyQuota: number;
  fullAccessQuota: number;
  note?: string;
}

export const EXHIBITOR_BOOTH_TYPES: ReadonlyArray<BoothType> = [
  { id: 'booth_3x3_corner',            label: '3 × 3 m (9 m²) Corner Booth, 2 sides open',  priceDisplay: '$5,900', currency: 'CAD', hallOnlyQuota: 4, fullAccessQuota: 2 },
  { id: 'booth_3x3',                   label: '3 × 3 m (9 m²)',                              priceDisplay: '$4,500', currency: 'CAD', hallOnlyQuota: 4, fullAccessQuota: 2 },
  { id: 'booth_3x6_corner',            label: '3 × 6 m (18 m²) Corner Booth, 2 sides open',  priceDisplay: '$9,000', currency: 'CAD', hallOnlyQuota: 6, fullAccessQuota: 4 },
  { id: 'booth_3x6_inline',            label: '3 × 6 m (18 m²) In-line, 1 side open',        priceDisplay: '$7,750', currency: 'CAD', hallOnlyQuota: 6, fullAccessQuota: 4 },
  { id: 'booth_nonprofit',             label: 'In-line Non-Profit Booth (3 × 3 m, 9 m²)',   priceDisplay: '$1,200', currency: 'USD', hallOnlyQuota: 2, fullAccessQuota: 1 },
  { id: 'booth_commercial_publishers', label: 'In-line Commercial Publishers (3 × 3 m, 9 m²)', priceDisplay: '$2,500', currency: 'USD', hallOnlyQuota: 2, fullAccessQuota: 1 },
];

export function getBoothType(id: string): BoothType | undefined {
  return EXHIBITOR_BOOTH_TYPES.find(b => b.id === id);
}
