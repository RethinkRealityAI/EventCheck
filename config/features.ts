/**
 * Feature flags for the GANSID Congress app.
 *
 * Sponsor surfaces are built behind flags. Flip a flag here (or set the
 * matching VITE_ env var at build time) to switch a surface on or off. The
 * Novartis home tile defaults ON; the rest default OFF.
 *
 *   VITE_FEATURE_SPONSOR_TILES=false  # hide the Novartis tile on the home screen
 *   VITE_FEATURE_SPONSORS_PAGE=true   # dedicated sponsors & partners page
 *   VITE_FEATURE_PUSH=true            # push notification opt-in card
 */

const env = (import.meta as any).env ?? {};

const flag = (key: string, fallback = false): boolean => {
  const raw = env[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true';
};

export const FEATURES = {
  /** In-grid sponsor tile on the portal home screen (Novartis / platinum partner). */
  sponsorTiles: flag('VITE_FEATURE_SPONSOR_TILES', true),
  /** Dedicated /portal/sponsors page + its home tile. */
  sponsorsPage: flag('VITE_FEATURE_SPONSORS_PAGE'),
  /** Push-notification opt-in card on the updates screen. */
  push: flag('VITE_FEATURE_PUSH'),
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}
