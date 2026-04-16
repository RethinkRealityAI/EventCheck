import { describe, it, expect } from 'vitest';
import { EXHIBITOR_TIERS, buildGansidExhibitor } from '../config/formTemplates/buildGansidExhibitor';

describe('EXHIBITOR_TIERS', () => {
  it('has four tiers with unique ids', () => {
    expect(EXHIBITOR_TIERS.length).toBe(4);
    const ids = EXHIBITOR_TIERS.map(t => t.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('all quotas are positive integers', () => {
    for (const t of EXHIBITOR_TIERS) {
      expect(Number.isInteger(t.hallOnlyQuota)).toBe(true);
      expect(t.hallOnlyQuota).toBeGreaterThan(0);
      expect(Number.isInteger(t.fullCongressQuota)).toBe(true);
      expect(t.fullCongressQuota).toBeGreaterThan(0);
    }
  });

  it('platinum has the highest quotas', () => {
    const platinum = EXHIBITOR_TIERS.find(t => t.id === 'platinum')!;
    const others = EXHIBITOR_TIERS.filter(t => t.id !== 'platinum');
    for (const t of others) {
      expect(platinum.hallOnlyQuota).toBeGreaterThanOrEqual(t.hallOnlyQuota);
      expect(platinum.fullCongressQuota).toBeGreaterThanOrEqual(t.fullCongressQuota);
    }
  });
});

describe('buildGansidExhibitor template', () => {
  it('returns a form with form_type exhibitor', () => {
    const form = buildGansidExhibitor() as any;
    expect(form.formType).toBe('exhibitor');
    expect(form.title).toMatch(/exhibitor/i);
  });

  it('settings.staffFormId points at the GANSID registration form', () => {
    const form = buildGansidExhibitor() as any;
    expect(form.settings?.staffFormId).toBe('gansid-congress-2026');
  });
});
