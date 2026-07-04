import { useState } from 'react';
import { usePortalContent } from '../content/ContentProvider';
import { IframeViewer } from '../ui/IframeViewer';
import type { SidebarLink } from '../../../types';
import { gradientForIndex } from './QuickLinks';

/**
 * Mobile-only floating Quick Access bar (lg:hidden). Mirrors the admin mobile
 * floating nav pattern in App.tsx but styled to the GANSID brand: a fixed,
 * rounded, gradient-glass pill anchored bottom-center, safe-area aware.
 * Each item performs the same action as its desktop Quick Access pill
 * (external link / iframe / disabled "soon").
 */
export function PortalQuickNav() {
  const { sidebarLinks } = usePortalContent();
  const [iframeLink, setIframeLink] = useState<SidebarLink | null>(null);

  if (!sidebarLinks?.length) return null;

  return (
    <>
      <nav
        aria-label="Quick access"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
      >
        <div className="pointer-events-auto flex max-w-md items-center gap-1.5 rounded-full bg-white/80 p-1.5 shadow-[0_18px_40px_-14px_rgba(26,28,28,0.45)] ring-1 ring-black/5 backdrop-blur-xl">
          {sidebarLinks.map((link, i) => {
            const gradient = gradientForIndex(i);
            const soon = link.mode === 'soon';
            const chip = (
              <span
                className="grid h-11 w-11 place-items-center rounded-full text-lg text-white shadow-md ring-1 ring-white/25"
                style={{ backgroundImage: gradient }}
                aria-hidden
              >
                {link.icon ?? '🔗'}
              </span>
            );

            if (soon) {
              return (
                <span
                  key={link.id}
                  aria-disabled
                  title={`${link.label} — coming soon`}
                  className="relative block cursor-default opacity-45 saturate-50"
                >
                  {chip}
                </span>
              );
            }

            if (link.mode === 'iframe' && link.href) {
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setIframeLink(link)}
                  aria-label={`Open ${link.label}`}
                  title={link.label}
                  className="block rounded-full transition-transform duration-300 ease-viscous active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50"
                >
                  {chip}
                </button>
              );
            }

            return (
              <a
                key={link.id}
                href={link.href}
                target="_top"
                rel="noopener noreferrer"
                aria-label={`${link.label} (opens in a new tab)`}
                title={link.label}
                className="block rounded-full transition-transform duration-300 ease-viscous active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/50"
              >
                {chip}
              </a>
            );
          })}
        </div>
      </nav>
      {iframeLink?.href && (
        <IframeViewer url={iframeLink.href} title={iframeLink.label} onClose={() => setIframeLink(null)} />
      )}
    </>
  );
}
