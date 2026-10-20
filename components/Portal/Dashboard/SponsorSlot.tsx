import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { FEATURES } from '../../../config/features';

/**
 * Sponsor surfaces, each gated by a flag in `config/features.ts` (or its VITE_
 * env var). The home tile defaults ON; set the flag false to pull it without
 * layout work.
 *
 *   <SponsorTile />          partner tile at the foot of the home screen
 *   <FeatureGate flag="…">   generic wrapper for anything else sponsor-related
 */

export function FeatureGate({ flag, children }: { flag: keyof typeof FEATURES; children: ReactNode }) {
  if (!FEATURES[flag]) return null;
  return <>{children}</>;
}

/**
 * Novartis brand tokens. The tile is the partner's creative, so it carries
 * their palette and typeface rather than the GANSID ones.
 */
const NV = {
  warmBlack: '#1C1C1A',
  lightGrey: '#EBEBEA',
  body: '#3A3A37',
};

/**
 * Novartis's corporate typeface, Volta Modern Display — 55 Roman (400) and
 * 65 Medium (500), used with their permission. Files live in
 * public/fonts/novartis/ and the @font-face rules in styles/portal.css.
 */
const NV_FONT = '"Volta Modern Display", "Helvetica Neue", Helvetica, Arial, sans-serif';

export interface SponsorTileProps {
  /** Partner name — logo alt text and the CTA label. */
  name?: string;
  /** Partner logo, shown full-colour above the copy. */
  logoUrl?: string | null;
  /** Cover image, shown edge to edge at 4:3. */
  imageUrl?: string | null;
  /** The partner's own paragraph. */
  body?: string;
  /** Where "Visit …" leads (opens in a new tab). */
  href?: string;
}

export function SponsorTile({ name = 'Novartis', logoUrl = null, imageUrl = null, body, href }: SponsorTileProps) {
  if (!FEATURES.sponsorTiles) return null;

  return (
    <article
      aria-label={name}
      className="overflow-hidden rounded-[26px] bg-white"
      style={{ boxShadow: `inset 0 0 0 1px ${NV.lightGrey}, 0 20px 44px -24px rgba(28,28,26,0.45)` }}
    >
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />}

      <div className="px-6 pb-6 pt-6">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-auto w-[150px] max-w-full" />
        ) : (
          <span className="font-display text-xl font-bold uppercase tracking-[0.06em]" style={{ color: NV.warmBlack }}>
            {name}
          </span>
        )}

        {body && (
          <>
            <div className="my-5 h-px" style={{ background: NV.lightGrey }} />
            <p className="text-[15px] leading-[1.7]" style={{ color: NV.body, fontFamily: NV_FONT }}>
              {body}
            </p>
          </>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-[14px] py-3.5 text-[16px] font-medium text-white shadow-[0_14px_28px_-16px_rgba(28,28,26,0.7)] transition-transform duration-300 ease-viscous active:scale-[0.98]"
            style={{ background: NV.warmBlack, fontFamily: NV_FONT }}
          >
            Visit {name}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
