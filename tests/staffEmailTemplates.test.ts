import { describe, it, expect } from 'vitest';
import { mergeTemplate, escapeHtml } from '../utils/sponsorEmailTemplates';

describe('staff email placeholder merge', () => {
  it('substitutes all staff-invite placeholders', () => {
    const tpl = 'Hi {{name}}, {{purchaser}} registered you for {{event}} ({{category}}). Visit {{complete_url}} or sign up at {{signup_url}}. Org: {{org_name}}.';
    const out = mergeTemplate(tpl, {
      name: 'Ada', purchaser: 'Jane', event: 'GANSID 2026',
      category: 'Hall-Only', complete_url: 'https://x/y', signup_url: 'https://x/z',
      org_name: 'Acme',
    });
    expect(out).toContain('Hi Ada');
    expect(out).toContain('GANSID 2026');
    expect(out).toContain('Hall-Only');
    expect(out).toContain('Acme');
    expect(out).not.toContain('{{');
  });

  it('HTML-escapes purchaser values', () => {
    const out = escapeHtml('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
  });
});
