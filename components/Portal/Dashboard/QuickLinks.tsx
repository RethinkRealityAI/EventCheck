import { useState } from 'react';
import { ExternalLink, ArrowUpRight, Clock } from 'lucide-react';
import { usePortalContent } from '../content/ContentProvider';
import { IframeViewer } from '../ui/IframeViewer';
import type { SidebarLink } from '../../../types';

/**
 * Every Quick Access pill shares ONE fully-opaque GANSID gradient sweeping
 * blue → red (matching the vivid Tier pills in FeesSection), so the stack reads
 * as a cohesive brand set rather than a rainbow of one-off colours. To keep the
 * pills from looking identical, only a faint radial sheen HIGHLIGHT moves to a
 * different corner per index — the base gradient underneath is uniform.
 */
const BASE_GRADIENT =
  'linear-gradient(115deg,#2260a1 0%,#1a4880 34%,#8b2a5e 68%,#ba0028 100%)';

// Per-index sheen: a soft white radial highlight anchored to a rotating corner.
// Layered ON TOP of the shared base gradient (comma-separated background-images),
// so each pill catches the light from a slightly different place.
const SHEEN_POSITIONS = [
  'radial-gradient(120% 90% at 12% 0%, rgba(255,255,255,0.30), transparent 60%)',
  'radial-gradient(120% 90% at 88% 0%, rgba(255,255,255,0.28), transparent 60%)',
  'radial-gradient(130% 95% at 92% 100%, rgba(255,255,255,0.22), transparent 62%)',
  'radial-gradient(130% 95% at 8% 100%, rgba(255,255,255,0.24), transparent 62%)',
];

export function backgroundForIndex(i: number): string {
  const sheen = SHEEN_POSITIONS[i % SHEEN_POSITIONS.length];
  return `${sheen}, ${BASE_GRADIENT}`;
}

/** A single fully-coloured gradient pill/card — the shared visual for a link. */
function QuickAccessPill({
  link,
  background,
  onOpenIframe,
}: {
  link: SidebarLink;
  background: string;
  onOpenIframe: (l: SidebarLink) => void;
}) {
  const soon = link.mode === 'soon';

  const inner = (
    <div
      className="group relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-white overflow-hidden shadow-[0_10px_24px_-12px_rgba(26,28,28,0.5)] ring-1 ring-white/10 transition-all duration-300 ease-viscous"
      style={{ backgroundImage: background }}
    >
      {/* top sheen — a crisp lit edge across the top of every pill */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent opacity-70" />
      {/* `soon` reads as a dimmed version of the SAME gradient (a soft dark
          veil), never a washed-out translucent panel. */}
      {soon && <div className="pointer-events-none absolute inset-0 bg-black/25" />}
      <span
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30 text-lg backdrop-blur-sm"
        aria-hidden
      >
        {link.icon ?? '🔗'}
      </span>
      <div className="relative flex min-w-0 flex-col">
        <span className="font-display font-semibold leading-tight tracking-tight">{link.label}</span>
        {link.description && (
          <span className="font-body text-xs text-white/80 truncate">{link.description}</span>
        )}
      </div>
      <span className="relative ml-auto shrink-0">
        {soon ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[10px] font-display font-bold uppercase tracking-[0.12em] ring-1 ring-white/25">
            <Clock className="h-3 w-3" /> Soon
          </span>
        ) : link.mode === 'iframe' ? (
          <ArrowUpRight className="h-5 w-5 opacity-80 transition-transform duration-300 ease-viscous group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        ) : (
          <ExternalLink className="h-4.5 w-4.5 opacity-80 transition-transform duration-300 ease-viscous group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        )}
      </span>
    </div>
  );

  if (soon) {
    return (
      <li aria-disabled className="cursor-default select-none">
        {inner}
      </li>
    );
  }

  if (link.mode === 'iframe' && link.href) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onOpenIframe(link)}
          aria-label={`Open ${link.label}`}
          className="block w-full text-left transition-transform duration-300 ease-viscous hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50 rounded-2xl"
        >
          {inner}
        </button>
      </li>
    );
  }

  // link mode (external)
  return (
    <li>
      <a
        href={link.href}
        target="_top"
        rel="noopener noreferrer"
        aria-label={`${link.label} (opens in a new tab)`}
        className="block transition-transform duration-300 ease-viscous hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50 rounded-2xl"
      >
        {inner}
      </a>
    </li>
  );
}

export function QuickLinks() {
  const { sidebarLinks } = usePortalContent();
  const [iframeLink, setIframeLink] = useState<SidebarLink | null>(null);

  if (!sidebarLinks?.length) return null;

  return (
    <section aria-labelledby="quick-access-heading">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-gansid-primary-gradient" aria-hidden />
        <h3
          id="quick-access-heading"
          className="font-display text-xs font-bold uppercase tracking-[0.2em] text-gansid-on-surface/50"
        >
          Quick Access
        </h3>
      </div>
      <ul className="space-y-2.5">
        {sidebarLinks.map((link, i) => (
          <QuickAccessPill
            key={link.id}
            link={link}
            background={backgroundForIndex(i)}
            onOpenIframe={setIframeLink}
          />
        ))}
      </ul>
      {iframeLink?.href && (
        <IframeViewer url={iframeLink.href} title={iframeLink.label} onClose={() => setIframeLink(null)} />
      )}
    </section>
  );
}
