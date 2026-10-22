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
  /** Approved legal line, bottom-left (e.g. "© 2026 Novartis Pharma AG, …"). */
  legalLine?: string;
  /** Approval reference, bottom-right (e.g. "FUSE ID FA-11814270 | 10/2026"). */
  referenceId?: string;
}

/**
 * Proportions follow Novartis's approved artwork (FA-11814270, 10/2026),
 * scaled to a narrow 290px card: ~6% side padding, logo ~38% of the width,
 * tight corner radius, a regular-weight CTA and the legal/FUSE footer under
 * the button. Body text is deliberately NOT scaled down with the rest — a
 * literal scale would land near 8px — so it stays legible on a phone.
 */
export function SponsorTile({
  name = 'Novartis',
  logoUrl = null,
  imageUrl = null,
  body,
  href,
  legalLine,
  referenceId,
}: SponsorTileProps) {
  if (!FEATURES.sponsorTiles) return null;

  return (
    <article
      aria-label={name}
      className="mx-auto w-full max-w-[290px] overflow-hidden rounded-[12px] bg-white"
      style={{ boxShadow: `inset 0 0 0 1px ${NV.lightGrey}, 0 18px 40px -24px rgba(28,28,26,0.45)` }}
    >
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />}

      <div className="px-[18px] pb-2.5 pt-5">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-auto w-[112px] max-w-full" />
        ) : (
          <span className="font-display text-base font-bold uppercase tracking-[0.06em]" style={{ color: NV.warmBlack }}>
            {name}
          </span>
        )}

        {body && (
          <>
            <div className="mb-[11px] mt-3 h-px" style={{ background: NV.lightGrey }} />
            <p className="text-[12.5px] leading-[1.65]" style={{ color: NV.warmBlack, fontFamily: NV_FONT }}>
              {body}
            </p>
          </>
        )}

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-[8px] py-[9px] text-[13.5px] font-normal text-white shadow-[0_10px_22px_-14px_rgba(28,28,26,0.7)] transition-transform duration-300 ease-viscous active:scale-[0.98]"
            style={{ background: NV.warmBlack, fontFamily: NV_FONT }}
          >
            Visit {name}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}

        {(legalLine || referenceId) && (
          <div className="mt-2.5 flex items-end justify-between gap-2" style={{ color: NV.warmBlack, fontFamily: NV_FONT }}>
            {legalLine && <p className="min-w-0 text-[7px] leading-[1.35]">{legalLine}</p>}
            {referenceId && <p className="shrink-0 whitespace-nowrap text-[8px] leading-[1.35]">{referenceId}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
