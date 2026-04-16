export type SiteKey = 'scago' | 'gansid';

export interface SiteConfig {
  key: SiteKey;
  displayName: string;
  adminSubtitle: string;
  pageTitle: string;
  /** Optional image asset path in `public/`. When unset, consumer falls back to an icon. */
  logoImage?: string;
  fallbackColors: { primary: string; accent: string };
  supportEmail: string;
}

const CONFIGS: Record<SiteKey, SiteConfig> = {
  scago: {
    key: 'scago',
    displayName: 'EventCheck',
    adminSubtitle: 'Admin Console',
    pageTitle: 'EventCheck',
    fallbackColors: { primary: '#4F46E5', accent: '#4F46E5' },
    supportEmail: 'info@scago.ca',
  },
  gansid: {
    key: 'gansid',
    displayName: 'GANSID Congress',
    adminSubtitle: 'Congress Admin',
    pageTitle: 'GANSID Congress — Registration',
    logoImage: '/branding/gansid/mark.svg',
    // GANSID brand: blue is the primary (the "GANSID" wordmark in the logo).
    // Red is the secondary accent (the "CONGRESS" wordmark + blood-drops mark).
    fallbackColors: { primary: '#1E4A8C', accent: '#B3282D' },
    supportEmail: 'congress@inheritedblooddisorders.world',
  },
};

function resolveSiteKey(): SiteKey {
  const raw = import.meta.env.VITE_SITE ?? '';
  return raw === 'gansid' ? 'gansid' : 'scago';
}

export const CURRENT_SITE: SiteConfig = CONFIGS[resolveSiteKey()];
