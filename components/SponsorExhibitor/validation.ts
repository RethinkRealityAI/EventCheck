import { getBoothType } from '../../config/formTemplates/boothTypes';

export type SponsorTier = 'signature' | 'gold' | 'silver' | 'award' | 'scholarship';
export type StaffCategory = 'hall_only' | 'full_access' | 'sponsor_seat';
export type RegistrationType = 'sponsor' | 'exhibitor';

export interface StaffEntry {
  name: string;
  email: string;
  category: StaffCategory;
  fullAnswers?: Record<string, unknown>;
}

export interface SponsorExhibitorPayload {
  registrationType: RegistrationType;
  org: {
    orgName: string;
    contactName: string;
    contactTitle?: string;
    email: string;
    phone?: string;
    address?: string;
    website?: string;
  };
  sponsorTier?: SponsorTier;
  sponsorItems?: Array<{ id: string; category: string; qty?: number }>;
  sponsoredAwards?: string[];
  boothType?: string;
  hasAllDetails: boolean;
  staff: StaffEntry[];
  consents: { terms: boolean; disclaimer: boolean; photo: boolean };
}

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export function getSponsorQuota(tier: SponsorTier): number {
  if (tier === 'signature') return 16;
  if (tier === 'gold' || tier === 'silver') return 8;
  return 0;
}

function isPlaceholder(s: StaffEntry): boolean {
  return !s.name.trim() && !s.email.trim();
}

export function validateSubmission(p: SponsorExhibitorPayload): ValidationResult {
  const errors: string[] = [];

  if (p.registrationType !== 'sponsor' && p.registrationType !== 'exhibitor') {
    errors.push('registrationType must be "sponsor" or "exhibitor"');
    return { ok: false, errors };
  }

  const hasTier = !!p.sponsorTier;
  const hasBooth = !!p.boothType;
  if (hasTier === hasBooth) {
    errors.push('Payload must have exactly one of sponsorTier or boothType');
  }
  if (p.registrationType === 'sponsor' && !hasTier) errors.push('sponsor flow requires sponsorTier');
  if (p.registrationType === 'exhibitor' && !hasBooth) errors.push('exhibitor flow requires boothType');

  if (!p.org?.orgName?.trim()) errors.push('orgName required');
  if (!p.org?.contactName?.trim()) errors.push('contactName required');
  if (!p.org?.email?.trim()) errors.push('contact email required');

  if (!p.consents?.terms || !p.consents?.disclaimer || !p.consents?.photo) {
    errors.push('all three consents must be accepted');
  }

  if (p.boothType) {
    const booth = getBoothType(p.boothType);
    if (!booth) {
      errors.push(`Unknown boothType: ${p.boothType}`);
    } else {
      const hallOnly = p.staff.filter(s => s.category === 'hall_only').length;
      const fullAccess = p.staff.filter(s => s.category === 'full_access').length;
      if (hallOnly > booth.hallOnlyQuota) {
        errors.push(`hall_only staff exceeds quota (${hallOnly} > ${booth.hallOnlyQuota})`);
      }
      if (fullAccess > booth.fullAccessQuota) {
        errors.push(`full_access staff exceeds quota (${fullAccess} > ${booth.fullAccessQuota})`);
      }
    }
  }

  if (p.sponsorTier) {
    const quota = getSponsorQuota(p.sponsorTier);
    const seats = p.staff.filter(s => s.category === 'sponsor_seat').length;
    if (seats > quota) {
      errors.push(`sponsor_seat staff exceeds tier quota (${seats} > ${quota})`);
    }
  }

  if (p.hasAllDetails) {
    p.staff.forEach((s, i) => {
      if (!s.name.trim() || !s.email.trim()) {
        errors.push(`staff[${i}] missing name or email under inline-details mode`);
      }
    });
  } else {
    p.staff.forEach((s, i) => {
      if (!isPlaceholder(s) && (!s.name.trim() || !s.email.trim())) {
        errors.push(`staff[${i}] partial — must have both name and email or be empty`);
      }
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
