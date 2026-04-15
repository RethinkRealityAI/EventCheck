import { describe, it, expect, vi, afterEach } from 'vitest';

describe('site config resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to scago when VITE_SITE is unset', async () => {
    vi.stubEnv('VITE_SITE', '');
    vi.resetModules();
    const { CURRENT_SITE } = await import('../config/sites');
    expect(CURRENT_SITE.key).toBe('scago');
    expect(CURRENT_SITE.displayName).toBe('EventCheck');
    expect(CURRENT_SITE.logoImage).toBeUndefined();
  });

  it('resolves gansid when VITE_SITE=gansid', async () => {
    vi.stubEnv('VITE_SITE', 'gansid');
    vi.resetModules();
    const { CURRENT_SITE } = await import('../config/sites');
    expect(CURRENT_SITE.key).toBe('gansid');
    expect(CURRENT_SITE.displayName).toBe('GANSID Congress');
    expect(CURRENT_SITE.logoImage).toBe('/branding/gansid/mark.svg');
  });

  it('falls back to scago on unknown VITE_SITE value', async () => {
    vi.stubEnv('VITE_SITE', 'nonsense');
    vi.resetModules();
    const { CURRENT_SITE } = await import('../config/sites');
    expect(CURRENT_SITE.key).toBe('scago');
  });
});
