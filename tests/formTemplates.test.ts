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

  // Regression guard: Bug 2 — seed SQL used "tickets" instead of "items" in ticketConfig.
  // This test catches any template that uses the wrong property name.
  it('ticket fields use ticketConfig.items not ticketConfig.tickets', () => {
    for (const t of TEMPLATES) {
      const form = t.build();
      const ticketFields = form.fields.filter((f: any) => f.type === 'ticket');
      for (const tf of ticketFields) {
        if ((tf as any).ticketConfig) {
          expect(
            (tf as any).ticketConfig,
            `Template "${t.key}" ticket field should use ticketConfig.items`,
          ).toHaveProperty('items');
          expect(
            (tf as any).ticketConfig,
            `Template "${t.key}" ticket field must NOT use ticketConfig.tickets`,
          ).not.toHaveProperty('tickets');
        }
      }
    }
  });

  // Regression guard: Bug 1 — mapper silently dropped unknown form_type values.
  // This test catches any template that uses an unrecognized formType value.
  it('every template formType is a recognized value', () => {
    const VALID_FORM_TYPES = ['event', 'sponsor', 'exhibitor', 'sponsor_exhibitor'];
    for (const t of TEMPLATES) {
      const form = t.build() as any;
      if (form.formType !== undefined) {
        expect(
          VALID_FORM_TYPES,
          `Template "${t.key}" has unrecognized formType "${form.formType}"`,
        ).toContain(form.formType);
      }
    }
  });

  it('gansid-sponsor-exhibitor template declares form_type sponsor_exhibitor', () => {
    const template = TEMPLATES.find(t => t.key === 'gansid-sponsor-exhibitor');
    expect(template).toBeDefined();
    const built = template!.build();
    expect((built as any).formType).toBe('sponsor_exhibitor');
  });

  it('gansid-sponsor-exhibitor template is gansid-only', () => {
    const tpl = TEMPLATES.find(t => t.key === 'gansid-sponsor-exhibitor');
    expect(tpl?.siteFilter).toEqual(['gansid']);
  });

  it('every template with a ticket field has ticketConfig.promoCodes array', () => {
    for (const t of TEMPLATES) {
      const form = t.build();
      const ticketFields = form.fields.filter((f: any) => f.type === 'ticket');
      for (const tf of ticketFields) {
        if ((tf as any).ticketConfig) {
          expect(
            Array.isArray((tf as any).ticketConfig.promoCodes),
            `Template "${t.key}" ticket field ticketConfig.promoCodes should be an array`,
          ).toBe(true);
        }
      }
    }
  });
});
