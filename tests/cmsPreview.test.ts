import { describe, it, expect } from 'vitest';
import { buildCmsPreviewUrl, cmsPreviewSection, isCmsPreviewHash } from '../utils/cmsPreview';

describe('isCmsPreviewHash', () => {
  it('detects cmsPreview=1 in hash query', () => {
    expect(isCmsPreviewHash('#/?cmsPreview=1')).toBe(true);
    expect(isCmsPreviewHash('#/portal?cmsPreview=1')).toBe(true);
    expect(isCmsPreviewHash('#/?cmsPreview=1&cmsSection=fees')).toBe(true);
  });
  it('rejects absent or wrong values', () => {
    expect(isCmsPreviewHash('#/')).toBe(false);
    expect(isCmsPreviewHash('#/?cmsPreview=0')).toBe(false);
    expect(isCmsPreviewHash('#/admin/content')).toBe(false);
  });
});

describe('cmsPreviewSection', () => {
  it('reads cmsSection', () => {
    expect(cmsPreviewSection('#/?cmsPreview=1&cmsSection=fees')).toBe('fees');
  });
  it('returns null when missing', () => {
    expect(cmsPreviewSection('#/?cmsPreview=1')).toBeNull();
  });
});

describe('buildCmsPreviewUrl', () => {
  const origin = 'https://example.test';
  it('builds landing / portal / pricing urls', () => {
    expect(buildCmsPreviewUrl('landing', origin)).toBe(`${origin}/#/?cmsPreview=1`);
    expect(buildCmsPreviewUrl('portal', origin)).toBe(`${origin}/#/portal?cmsPreview=1`);
    expect(buildCmsPreviewUrl('pricing', origin)).toBe(`${origin}/#/?cmsPreview=1&cmsSection=fees`);
  });
});
