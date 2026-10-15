// Browser-tab / home-screen icons per site. Kept free of import.meta.env so
// vite.config.ts can import it and write the tags into index.html at build
// time (the right icon shows before any JavaScript runs).

import type { SiteKey } from './sites';

export interface SiteFavicons {
  /** Multi-size .ico (16/32/48) — the universal fallback. */
  ico: string;
  /** Preferred scalable/PNG icon for modern browsers. */
  icon: { href: string; type: string; sizes?: string };
  /** 180×180, opaque — iOS home screen. */
  appleTouch: string;
}

export const FAVICONS: Record<SiteKey, SiteFavicons> = {
  scago: {
    ico: '/branding/eventcheck/favicon.ico',
    icon: { href: '/branding/eventcheck/favicon.svg', type: 'image/svg+xml' },
    appleTouch: '/branding/eventcheck/apple-touch-icon.png',
  },
  gansid: {
    ico: '/branding/gansid/favicon.ico',
    icon: { href: '/branding/gansid/favicon-192.png', type: 'image/png', sizes: '192x192' },
    appleTouch: '/branding/gansid/apple-touch-icon.png',
  },
};

export function faviconSiteKey(raw: string | undefined): SiteKey {
  return raw === 'gansid' ? 'gansid' : 'scago';
}

/** The <link> tags for a site, as HTML. */
export function faviconTags(key: SiteKey): string {
  const f = FAVICONS[key];
  const sizes = f.icon.sizes ? ` sizes="${f.icon.sizes}"` : '';
  return [
    `<link rel="icon" href="${f.ico}" sizes="any" />`,
    `<link rel="icon" href="${f.icon.href}" type="${f.icon.type}"${sizes} />`,
    `<link rel="apple-touch-icon" href="${f.appleTouch}" />`,
  ].join('\n  ');
}
