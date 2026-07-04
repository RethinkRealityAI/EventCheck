import { useState } from 'react';
import { ExternalLink, ArrowUpRight, Clock } from 'lucide-react';
import { usePortalContent } from '../content/ContentProvider';
import { IframeViewer } from '../ui/IframeViewer';
import type { SidebarLink } from '../../../types';

/**
 * Tasteful gradient rotation for the Quick Access pills. Cycles through the
 * four GANSID brand gradients so the stack reads colourful, not monotone.
 * Mirrors the "step gradient" palette used on the Landing InfoTabs +
 * the Tier pills in FeesSection.
 */
const PILL_GRADIENTS = [
  'linear-gradient(135deg,#ba0028 0%,#E0243C 100%)',          // red
  'linear-gradient(135deg,#2260a1 0%,#1a4880 100%)',          // blue
  'linear-gradient(135deg,#8b2a5e 0%,#5a3575 100%)',          // purple/magenta
  'linear-gradient(120deg,#2260a1 0%,#E0243C 55%,#ba0028 100%)', // reverse sweep
];

export function gradientForIndex(i: number): string {
  return PILL_GRADIENTS[i % PILL_GRADIENTS.length];
}

/** A single fully-coloured gradient pill/card — the shared visual for a link. */
function QuickAccessPill({
  link,
  gradient,
  onOpenIframe,
}: {
  link: SidebarLink;
  gradient: string;
  onOpenIframe: (l: SidebarLink) => void;
}) {
  const soon = link.mode === 'soon';

  const inner = (
    <div
      className="group relative flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-white overflow-hidden shadow-[0_10px_24px_-12px_rgba(26,28,28,0.5)] transition-all duration-300 ease-viscous"
      style={{ backgroundImage: gradient }}
    >
      {/* top sheen */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent opacity-70" />
      {soon && <div className="pointer-events-none absolute inset-0 bg-white/25 backdrop-saturate-50" />}
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
      <li aria-disabled className="cursor-default select-none opacity-95">
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
            gradient={gradientForIndex(i)}
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
