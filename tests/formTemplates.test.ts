import { describe, it, expect } from 'vitest';
import { TEMPLATES, availableTemplatesForSite } from '../config/formTemplates';

describe('form templates', () => {
  it('registry is non-empty and keys are unique', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
    const keys = TEMPLATES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every template builds a form with fields array', () => {
    for (const t of TEMPLATES) {
      const form = t.build();
      expect(form).toBeDefined();
      expect(Array.isArray(form.fields)).toBe(true);
      expect(typeof form.title).toBe('string');
    }
  });

  it('availableTemplatesForSite filters by siteFilter', () => {
    const forScago = availableTemplatesForSite('scago');
    const forGansid = availableTemplatesForSite('gansid');
    expect(forGansid.some(t => t.key === 'gansid-individual-group')).toBe(true);
    expect(forScago.some(t => t.key === 'gansid-individual-group')).toBe(false);
    expect(forScago.some(t => t.key === 'sponsor')).toBe(true);
    expect(forGansid.some(t => t.key === 'blank')).toBe(true);
  });

  it('gansid-individual-group template has a registration-mode-selector field', () => {
    const t = TEMPLATES.find(t => t.key === 'gansid-individual-group')!;
    const form = t.build();
    expect(form.fields.some((f: any) => f.type === 'registration-mode-selector')).toBe(true);
  });

  it('gansid-individual-group template has exactly one country field flagged for pricing', () => {
    const t = TEMPLATES.find(t => t.key === 'gansid-individual-group')!;
    const form = t.build();
    const flagged = form.fields.filter((f: any) => f.type === 'country' && f.usedForPricing);
    expect(flagged.length).toBe(1);
  });
});
