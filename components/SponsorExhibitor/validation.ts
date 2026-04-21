import { getBoothType } from '../../config/formTemplates/boothTypes';
import { getSponsorTier } from '../../config/formTemplates/sponsorTiers';

// GANSID combined sponsor_exhibitor tiers. Exhibitor booths and sponsor tiers have
// the SAME shape — each offers a Hall-Only and a Full-Congress (aka Full-Access)
// seat quota — so the staff roster uses the same two categories regardless of
// which side of the form the primary filled out.
export type SponsorTier = 'platinum' | 'gold' | 'silver' | 'bronze';
export type StaffCategory = 'hall_only' | 'full_access';
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
  boothType?: string;
  hasAllDetails: boolean;
  staff: StaffEntry[];
  consents: { terms: boolean; disclaimer: boolean; photo: boolean };
}

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export interface CategoryQuota {
  hall_only: number;
  full_access: number;
}

export function getSponsorQuota(tier: SponsorTier): CategoryQuota {
  const t = getSponsorTier(tier);
  if (!t) return { hall_only: 0, full_access: 0 };
  return { hall_only: t.hallOnlyQuota, full_access: t.fullCongressQuota };
}

export function getExhibitorQuota(boothTypeId: string): CategoryQuota {
  const b = getBoothType(boothTypeId);
  if (!b) return { hall_only: 0, full_access: 0 };
  return { hall_only: b.hallOnlyQuota, full_access: b.fullAccessQuota };
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

  // Resolve quotas for whichever side was picked. Both sides use the same
  // hall_only / full_access staff categories, so the validation is uniform.
  let quota: CategoryQuota | null = null;
  if (p.boothType) {
    const booth = getBoothType(p.boothType);
    if (!booth) errors.push(`Unknown boothType: ${p.boothType}`);
    else quota = { hall_only: booth.hallOnlyQuota, full_access: booth.fullAccessQuota };
  } else if (p.sponsorTier) {
    const tier = getSponsorTier(p.sponsorTier);
    if (!tier) errors.push(`Unknown sponsorTier: ${p.sponsorTier}`);
    else quota = { hall_only: tier.hallOnlyQuota, full_access: tier.fullCongressQuota };
  }

  if (quota) {
    const hallOnly = p.staff.filter(s => s.category === 'hall_only').length;
    const fullAccess = p.staff.filter(s => s.category === 'full_access').length;
    if (hallOnly > quota.hall_only) {
      errors.push(`hall_only staff exceeds quota (${hallOnly} > ${quota.hall_only})`);
    }
    if (fullAccess > quota.full_access) {
      errors.push(`full_access staff exceeds quota (${fullAccess} > ${quota.full_access})`);
    }
  }

  // Reject unknown staff categories so a stale client can't smuggle legacy values.
  p.staff.forEach((s, i) => {
    if (s.category !== 'hall_only' && s.category !== 'full_access') {
      errors.push(`staff[${i}] has invalid category "${s.category}"`);
    }
  });

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
