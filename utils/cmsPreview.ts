/** Hash-query helpers for the CMS live-preview iframe (`cmsPreview=1`). */

export function isCmsPreviewHash(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): boolean {
  return /[?&]cmsPreview=1(&|$)/.test(hash);
}

export function cmsPreviewSection(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): string | null {
  const m = /[?&]cmsSection=([^&]*)/.exec(hash);
  return m ? decodeURIComponent(m[1]) : null;
}

export type CmsPreviewTarget = 'landing' | 'portal' | 'pricing';

/** Build the iframe URL for a CMS tab. Pricing scrolls to fees via `cmsSection`. */
export function buildCmsPreviewUrl(target: CmsPreviewTarget, origin: string = window.location.origin): string {
  switch (target) {
    case 'portal':
      return `${origin}/#/portal?cmsPreview=1`;
    case 'pricing':
      return `${origin}/#/?cmsPreview=1&cmsSection=fees`;
    case 'landing':
      return `${origin}/#/?cmsPreview=1`;
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}
