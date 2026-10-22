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
  /** The artwork sets its copy in pure black, not the warm black of the button. */
  ink: '#000000',
};

/**
 * The artwork uses 55 Roman, but browsers render it noticeably lighter than the
 * PDF does. 65 Medium overshoots (visibly bolder than the artwork), so the copy
 * and CTA stay in 55 Roman with a hairline stroke that adds just the missing
 * weight — compared side by side with the PDF at phone width.
 */
const NV_WEIGHT = 400;
const NV_STROKE = '0.025em currentColor';

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
 * A scaled-down copy of Novartis's approved artwork (FA-11814270, 10/2026).
 *
 * Every size below is written in the artwork's own points (the card is 420pt
 * wide) and converted to container-query units of the card's width, so the
 * whole tile scales as ONE piece: as wide as the column allows, capped at the
 * artwork's native 420px, with spacing, type, logo, button and footer keeping
 * the PDF's proportions at any width. Measured from the PDF itself with
 * PyMuPDF. The only deviation: the two footer lines have a small floor so they
 * stay readable on a phone instead of shrinking to ~4px.
 */
const ART_WIDTH_PT = 420;
const pt = (v: number) => `${((v / ART_WIDTH_PT) * 100).toFixed(3)}cqw`;
const ptMin = (v: number, minPx: number) => `max(${pt(v)}, ${minPx}px)`;

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
    // The wrapper is the size container the cqw units resolve against.
    <div className="mx-auto w-full max-w-[420px]" style={{ containerType: 'inline-size' }}>
      <article
        aria-label={name}
        className="overflow-hidden bg-white"
        style={{
          borderRadius: pt(13),
          boxShadow: `inset 0 0 0 1px ${NV.lightGrey}, 0 18px 40px -24px rgba(28,28,26,0.45)`,
        }}
      >
        {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />}

        <div style={{ padding: `${pt(27.8)} ${pt(27)} ${pt(5)}` }}>
          {logoUrl ? (
            <img src={logoUrl} alt={name} className="block h-auto" style={{ width: pt(160.5) }} />
          ) : (
            <span className="font-display font-bold uppercase tracking-[0.06em]" style={{ color: NV.warmBlack, fontSize: pt(16) }}>
              {name}
            </span>
          )}

          {body && (
            <>
              <div style={{ marginTop: pt(17.9), height: 'max(1px, 0.19cqw)', background: NV.lightGrey }} />
              <p
                style={{
                  marginTop: pt(13.6),
                  fontSize: pt(12.69),
                  lineHeight: 20 / 12.69,
                  color: NV.ink,
                  fontFamily: NV_FONT,
                  fontWeight: NV_WEIGHT,
                  WebkitTextStroke: NV_STROKE,
                }}
              >
                {body}
              </p>
            </>
          )}

          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center text-white shadow-[0_10px_22px_-14px_rgba(28,28,26,0.7)] transition-transform duration-300 ease-viscous active:scale-[0.98]"
              style={{
                marginTop: pt(23),
                height: pt(46),
                gap: pt(12),
                borderRadius: pt(9),
                fontSize: pt(12.5),
                background: NV.warmBlack,
                fontFamily: NV_FONT,
                fontWeight: NV_WEIGHT,
                WebkitTextStroke: NV_STROKE,
              }}
            >
              Visit {name}
              <ArrowUpRight aria-hidden style={{ width: pt(10), height: pt(10) }} />
            </a>
          )}

          {(legalLine || referenceId) && (
            <div
              className="flex items-end justify-between"
              style={{ marginTop: pt(15.5), gap: pt(8), color: NV.ink, lineHeight: 1.35 }}
            >
              {legalLine && (
                <p className="min-w-0" style={{ fontSize: ptMin(5.2, 5), fontFamily: 'Helvetica, Arial, sans-serif' }}>
                  {legalLine}
                </p>
              )}
              {referenceId && (
                <p className="shrink-0 whitespace-nowrap" style={{ fontSize: ptMin(7.12, 6), fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  {referenceId}
                </p>
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
