import { describe, it, expect } from 'vitest';
import {
  validateSubmission,
  getSponsorQuota,
  getExhibitorQuota,
  computeExtrasSubtotalUsd,
  EXTRA_STAFF_MAX_PER_ORDER,
  EXTRA_STAFF_UNIT_PRICE_USD,
  type SponsorExhibitorPayload,
  type ExtraStaffEntry,
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

  describe('paid extras', () => {
    const validExtra = (i: number): ExtraStaffEntry => ({
      name: `Extra ${i}`,
      email: `extra${i}@a.test`,
      category: 'hall_only',
    });

    it('accepts a valid extras list', () => {
      const r = validateSubmission({
        registrationType: 'sponsor',
        org: baseOrg, sponsorTier: 'gold',
        hasAllDetails: false,
        staff: [],
        extras: [validExtra(1), validExtra(2)],
        consents: { terms: true, disclaimer: true, photo: true },
      } as SponsorExhibitorPayload);
      expect(r.ok).toBe(true);
    });

    it('rejects extras over the cap', () => {
      const extras = Array.from({ length: EXTRA_STAFF_MAX_PER_ORDER + 1 }, (_, i) => validExtra(i));
      const r = validateSubmission({
        registrationType: 'sponsor',
        org: baseOrg, sponsorTier: 'platinum',
        hasAllDetails: false,
        staff: [],
        extras,
        consents: { terms: true, disclaimer: true, photo: true },
      } as SponsorExhibitorPayload);
      expect(r.ok).toBe(false);
      expect(r.errors?.join(' ')).toMatch(/exceeds cap/);
    });

    it('rejects extras missing name', () => {
      const r = validateSubmission({
        registrationType: 'sponsor',
        org: baseOrg, sponsorTier: 'gold',
        hasAllDetails: false,
        staff: [],
        extras: [{ name: '', email: 'x@a.test', category: 'hall_only' }],
        consents: { terms: true, disclaimer: true, photo: true },
      } as SponsorExhibitorPayload);
      expect(r.ok).toBe(false);
      expect(r.errors?.join(' ')).toMatch(/name required/);
    });

    it('rejects extras with invalid category', () => {
      const r = validateSubmission({
        registrationType: 'sponsor',
        org: baseOrg, sponsorTier: 'gold',
        hasAllDetails: false,
        staff: [],
        extras: [{ name: 'A', email: 'a@a.test', category: 'sponsor_seat' as any }],
        consents: { terms: true, disclaimer: true, photo: true },
      } as SponsorExhibitorPayload);
      expect(r.ok).toBe(false);
      expect(r.errors?.join(' ')).toMatch(/invalid category/);
    });

    it('treats missing extras array as empty', () => {
      const payload = {
        registrationType: 'sponsor',
        org: baseOrg, sponsorTier: 'gold',
        hasAllDetails: false,
        staff: [],
        consents: { terms: true, disclaimer: true, photo: true },
      } as SponsorExhibitorPayload;
      const r = validateSubmission(payload);
      expect(r.ok).toBe(true);
    });
  });
});

describe('computeExtrasSubtotalUsd', () => {
  it('returns 0 for empty extras', () => {
    expect(computeExtrasSubtotalUsd([])).toBe(0);
  });

  it('returns 0 when extras is undefined', () => {
    expect(computeExtrasSubtotalUsd(undefined)).toBe(0);
  });

  it('multiplies count by unit price', () => {
    const extras: ExtraStaffEntry[] = [
      { name: 'A', email: 'a@a.test', category: 'hall_only' },
      { name: 'B', email: 'b@a.test', category: 'full_access' },
      { name: 'C', email: 'c@a.test', category: 'hall_only' },
    ];
    expect(computeExtrasSubtotalUsd(extras)).toBe(EXTRA_STAFF_UNIT_PRICE_USD * 3);
  });
});
