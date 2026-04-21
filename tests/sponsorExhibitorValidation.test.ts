import { describe, it, expect } from 'vitest';
import {
  validateSubmission,
  getSponsorQuota,
  getExhibitorQuota,
  type SponsorExhibitorPayload,
} from '../components/SponsorExhibitor/validation';

const baseOrg = {
  orgName: 'Acme', contactName: 'Jane', email: 'jane@acme.test',
};

describe('getSponsorQuota', () => {
  it('returns platinum quota (12+6)', () => {
    expect(getSponsorQuota('platinum')).toEqual({ hall_only: 12, full_access: 6 });
  });
  it('returns gold quota (8+4)', () => {
    expect(getSponsorQuota('gold')).toEqual({ hall_only: 8, full_access: 4 });
  });
  it('returns silver quota (6+3)', () => {
    expect(getSponsorQuota('silver')).toEqual({ hall_only: 6, full_access: 3 });
  });
  it('returns bronze quota (4+2)', () => {
    expect(getSponsorQuota('bronze')).toEqual({ hall_only: 4, full_access: 2 });
  });
});

describe('getExhibitorQuota', () => {
  it('returns booth_3x3 quota', () => {
    expect(getExhibitorQuota('booth_3x3')).toEqual({ hall_only: 4, full_access: 2 });
  });
  it('returns booth_nonprofit quota', () => {
    expect(getExhibitorQuota('booth_nonprofit')).toEqual({ hall_only: 2, full_access: 1 });
  });
  it('returns zero quota for unknown booth', () => {
    expect(getExhibitorQuota('nonexistent')).toEqual({ hall_only: 0, full_access: 0 });
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

  it('rejects missing consents', () => {
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
      org: baseOrg, boothType: 'booth_3x3',   // hall_only cap = 4
      hasAllDetails: false, staff,
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/hall_only.*quota/);
  });

  it('rejects sponsor staff count exceeding tier quota', () => {
    // Bronze tier: 4 Hall-Only + 2 Full Congress. Send 3 Full-Access → over.
    const staff = Array.from({ length: 3 }, (_, i) => ({
      name: `S${i}`, email: `s${i}@a.test`, category: 'full_access' as const,
    }));
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'bronze',
      hasAllDetails: false, staff,
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/full_access.*quota/);
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

  it('accepts sponsor payload with mixed categories up to quota', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'platinum',
      hasAllDetails: false,
      staff: [
        { name: 'A', email: 'a@a.test', category: 'hall_only' },
        { name: 'B', email: 'b@a.test', category: 'full_access' },
      ],
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
        { name: 'Known', email: 'k@a.test', category: 'hall_only' },
        { name: '', email: '', category: 'full_access' },
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
      staff: [{ name: '', email: '', category: 'hall_only', fullAnswers: {} }],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
  });

  it('rejects legacy sponsor_seat category', () => {
    const r = validateSubmission({
      registrationType: 'sponsor',
      org: baseOrg, sponsorTier: 'gold',
      hasAllDetails: false,
      staff: [{ name: 'X', email: 'x@a.test', category: 'sponsor_seat' as any }],
      consents: { terms: true, disclaimer: true, photo: true },
    } as SponsorExhibitorPayload);
    expect(r.ok).toBe(false);
    expect(r.errors?.join(' ')).toMatch(/invalid category/);
  });
});
