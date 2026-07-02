import { describe, it, expect } from 'vitest';
import { resolveEmailTemplate, CORE_OVERRIDE_TEMPLATE_KEYS } from '../supabase/functions/_shared/emailTemplates';

const base = {
  defaultSubject: 'DEF SUB', defaultBody: 'DEF BODY',
  globalHeaderImageUrl: 'https://global/logo.png', globalFooterText: 'global footer',
};

describe('resolveEmailTemplate', () => {
  it('uses global app_settings when no form override', () => {
    const r = resolveEmailTemplate({ ...base, globalSubject: 'G SUB', globalBody: 'G BODY' });
    expect(r).toEqual({ subject: 'G SUB', body: 'G BODY', headerImageUrl: 'https://global/logo.png', footerText: 'global footer' });
  });

  it('falls back to default when global is empty', () => {
    const r = resolveEmailTemplate({ ...base, globalSubject: '', globalBody: undefined });
    expect(r.subject).toBe('DEF SUB');
    expect(r.body).toBe('DEF BODY');
  });

  it('per-form override wins per-field; unset fields inherit global', () => {
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G SUB', globalBody: 'G BODY',
      formOverride: { body: 'FORM BODY' }, // subject unset → inherits global
    });
    expect(r.subject).toBe('G SUB');
    expect(r.body).toBe('FORM BODY');
  });

  it('per-form header image overrides the global logo', () => {
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G', globalBody: 'G',
      formHeaderImageUrl: 'https://form/banner.png',
    });
    expect(r.headerImageUrl).toBe('https://form/banner.png');
  });

  it('ignores data: URI header images (Gmail/Outlook strip them) and falls through', () => {
    // SCAGO's live email_header_logo is a base64 data: SVG — must NOT ship in sends.
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G', globalBody: 'G',
      globalHeaderImageUrl: 'data:image/svg+xml;base64,AAAA',
    });
    expect(r.headerImageUrl).toBeUndefined();
    const r2 = resolveEmailTemplate({
      ...base, globalSubject: 'G', globalBody: 'G',
      formHeaderImageUrl: 'data:image/png;base64,BBBB', // bad form value falls through to global https
    });
    expect(r2.headerImageUrl).toBe('https://global/logo.png');
  });

  it('empty-string form override fields are ignored (treated as unset)', () => {
    const r = resolveEmailTemplate({
      ...base, globalSubject: 'G SUB', globalBody: 'G BODY',
      formOverride: { subject: '', body: '   ' },
    });
    expect(r.subject).toBe('G SUB');
    expect(r.body).toBe('G BODY');
  });

  it('exposes the 5 core override keys', () => {
    expect(CORE_OVERRIDE_TEMPLATE_KEYS).toEqual(['ticket', 'table-purchaser', 'guest', 'guest-claim', 'guest-confirmed']);
  });
});
