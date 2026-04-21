import { describe, it, expect } from 'vitest';
import {
  validateSubmission,
  getSponsorQuota,
  type SponsorExhibitorPayload,
} from '../components/SponsorExhibitor/validation';

const baseOrg = {
  orgName: 'Acme', contactName: 'Jane', email: 'jane@acme.test',
};

describe('getSponsorQuota', () => {
  it('signature=16, gold/silver=8, award/scholarship=0', () => {
    expect(getSponsorQuota('signature')).toBe(16);
    expect(getSponsorQuota('gold')).toBe(8);
    expect(getSponsorQuota('silver')).toBe(8);
    expect(getSponsorQuota('award')).toBe(0);
    expect(getSponsorQuota('scholarship')).toBe(0);
  });
});

describe('validateSubmission', () => {
  it('requires registrationType', () => {
    const r = validateSubmission({} as any);
    expect(r.ok).toBe(false);
    expect(r.errors?.[0]).toMatch(/registrationType/);
  });

  it('rejects both tier and boothType set', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold', boothType: 'booth_3x3',
      hasAllDetails: false, staff: [],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/exactly one of/);
  });

  it('rejects missing all three consents', () => {
    const r = validateSubmission({
      registrationType: 'exhibitor',
      org: baseOrg, boothType: 'booth_3x3',
      hasAllDetails: false, staff: [],
      consents: { terms: false, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/consent/i);
  });

  it('rejects staff count exceeding booth quota', () => {
    const staff = Array.from({ length: 5 }, (_, i) => ({
      name: `S${i}`, email: `s${i}@a.test`, category: 'hall_only' as const,
    }));
    const r = validateSubmission({
      registrationType: 'exhibitor',
      org: baseOrg, boothType: 'booth_3x3',   // hall_only quota = 4
      hasAllDetails: false, staff,
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/hall_only.*quota/);
  });

  it('accepts valid exhibitor payload under quota', () => {
    const r = validateSubmission({
      registrationType: 'exhibitor',
      org: baseOrg, boothType: 'booth_3x3',
      hasAllDetails: false,
      staff: [{ name: 'S', email: 's@a.test', category: 'hall_only' }],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(true);
  });

  it('accepts sponsor payload with empty placeholder slots', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold',
      hasAllDetails: false,
      staff: [
        { name: 'Known', email: 'k@a.test', category: 'sponsor_seat' },
        { name: '', email: '', category: 'sponsor_seat' },
      ],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(true);
  });

  it('rejects inline staff with missing name/email', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold',
      hasAllDetails: true,
      staff: [{ name: '', email: '', category: 'sponsor_seat', fullAnswers: {} }],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
  });
});
