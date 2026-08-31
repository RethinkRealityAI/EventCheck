import { describe, it, expect } from 'vitest';
import {
  resolveIndiaPartner,
  DEFAULT_INDIA_PARTNER_URL,
  DEFAULT_INDIA_PARTNER_NAME,
} from '../utils/indiaPartner';

describe('resolveIndiaPartner', () => {
  it('defaults ON for the GANSID congress form with no settings at all', () => {
    const c = resolveIndiaPartner('gansid-congress-2026', undefined);
    expect(c).toEqual({ pageUrl: DEFAULT_INDIA_PARTNER_URL, partnerName: DEFAULT_INDIA_PARTNER_NAME });
  });

  it('stays OFF for every other form unless explicitly enabled', () => {
    expect(resolveIndiaPartner('some-other-form', undefined)).toBeNull();
    expect(resolveIndiaPartner('some-other-form', { indiaPartner: {} })).toBeNull();
    expect(resolveIndiaPartner(undefined, undefined)).toBeNull();
  });

  it('enabled:true switches it on for any form', () => {
    const c = resolveIndiaPartner('hope-gala', { indiaPartner: { enabled: true } });
    expect(c?.pageUrl).toBe(DEFAULT_INDIA_PARTNER_URL);
  });

  it('enabled:false is a kill switch, even on the default form', () => {
    expect(resolveIndiaPartner('gansid-congress-2026', { indiaPartner: { enabled: false } })).toBeNull();
  });

  it('honours URL and partner-name overrides', () => {
    const c = resolveIndiaPartner('gansid-congress-2026', {
      indiaPartner: { pageUrl: 'https://example.org/pay', partnerName: 'Example Partner' },
    });
    expect(c).toEqual({ pageUrl: 'https://example.org/pay', partnerName: 'Example Partner' });
  });

  it('empty-string overrides fall back to defaults rather than breaking the iframe', () => {
    const c = resolveIndiaPartner('gansid-congress-2026', { indiaPartner: { pageUrl: '', partnerName: '' } });
    expect(c?.pageUrl).toBe(DEFAULT_INDIA_PARTNER_URL);
    expect(c?.partnerName).toBe(DEFAULT_INDIA_PARTNER_NAME);
  });
});
