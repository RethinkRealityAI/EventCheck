import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
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
 * their palette rather than the GANSID one.
 */
const NV = {
  warmBlack: '#1C1C1A',
  softWhite: '#F8F7F5',
  lightGrey: '#EBEBEA',
  midGrey: '#8C8B89',
  orange: '#FF4E00',
  body: '#3A3A37',
};

export interface SponsorTileProps {
  /** Partner name, used as the wordmark until a logo is supplied. */
  name?: string;
  /** Tier label above the title. */
  tier?: string;
  /** One line under the tier. */
  title?: string;
  /** Partner logo (shown 92×28, contained). Originals come from the client. */
  logoUrl?: string | null;
  /** Landscape cover image (shown 140px tall, cover). */
  imageUrl?: string | null;
  /** CSS object-position for the cover, to keep the subject in the 140px crop. */
  imagePosition?: string;
  /** Optional paragraph under the name row — the partner's own copy. */
  body?: string;
  /** Where the tile leads. */
  href?: string;
}

export function SponsorTile({
  name = 'Novartis',
  tier = 'Platinum partner',
  title = 'GANSID Congress 2026',
  logoUrl = null,
  imageUrl = null,
  imagePosition = 'center',
  body,
  href,
}: SponsorTileProps) {
  if (!FEATURES.sponsorTiles) return null;

  const inner = (
    <div
      className="relative overflow-hidden rounded-[26px] transition-transform duration-300 ease-viscous active:scale-[0.98]"
      style={{
        background: NV.softWhite,
        boxShadow: `inset 0 0 0 1px ${NV.lightGrey}, 0 20px 44px -24px rgba(28,28,26,0.55)`,
      }}
    >
      <div className="relative h-[140px] w-full" style={{ background: NV.warmBlack }}>
        {imageUrl && (
          <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: imagePosition }} />
        )}
        <span
          className="absolute left-3 top-3 rounded-full px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-[0.14em] text-white"
          style={{ background: 'rgba(28,28,26,0.62)' }}
        >
          Sponsored
        </span>
      </div>
      <div className="h-[3px]" style={{ background: NV.orange }} />
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        <span className="flex h-7 w-[92px] shrink-0 items-center">
          {logoUrl ? (
            <img src={logoUrl} alt={name} className="h-7 w-[92px] object-contain object-left" />
          ) : (
            <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.06em]" style={{ color: NV.warmBlack }}>
              {name}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: NV.midGrey }}>
            {tier}
          </span>
          <span className="block font-display text-[14px] font-bold leading-snug" style={{ color: NV.warmBlack }}>
            {title}
          </span>
        </span>
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-white" style={{ background: NV.orange }} aria-hidden>
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      {body && (
        <p className="px-4 pb-4 font-body text-[13px] leading-relaxed" style={{ color: NV.body }}>
          {body}
        </p>
      )}
    </div>
  );

  if (!href) return inner;
  return (
    <a href={href} target="_top" rel="noopener noreferrer" aria-label={`${name} — ${tier}`} className="block">
      {inner}
    </a>
  );
}
