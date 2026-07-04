import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePortalContent } from '../content/ContentProvider';
import { IframeViewer } from '../ui/IframeViewer';
import { PortalMenuSheet } from './PortalMenuSheet';
import type { SidebarLink } from '../../../types';
import {
  HomeIcon,
  TicketIcon,
  MenuIcon,
  ClockIcon,
  iconForSidebarLink,
} from './navIcons';

/**
 * Premium mobile floating nav (lg:hidden) — the PRIMARY navigation for the
 * whole Congress app on phones. A liquid-glass (frosted translucent dark) bar
 * anchored bottom-center, safe-area aware, with custom minimal white stroke
 * SVG icons + small labels underneath.
 *
 * Layout: Home + Tickets are always present (with active-route highlight),
 * then up to two of the CMS `sidebarLinks` Quick Access items, then a Menu
 * button that opens {@link PortalMenuSheet} carrying everything else
 * (Profile, My Tickets, Admin, Sign Out) so the bar never crowds. Each Quick
 * Access item keeps its original behaviour: external link (`target="_top"`),
 * iframe (opens IframeViewer), or disabled "soon".
 */

export function PortalQuickNav() {
  const { sidebarLinks } = usePortalContent();
  const location = useLocation();
  const [iframeLink, setIframeLink] = useState<SidebarLink | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const path = location.pathname;
  const isHome = path === '/portal' || path === '/portal/';
  const isTickets = path.startsWith('/portal/tickets');

  // Take the two most important Quick Access items for the inline bar; the
  // rest live in the menu sheet so the bar stays to 5 slots max.
  const inlineLinks = (sidebarLinks ?? []).slice(0, 2);

  // Shared cell styling. `active` gets a filled frosted pill; the rest are
  // ghost cells that light up on press.
  const cellClass = (active?: boolean, disabled?: boolean) =>
    [
      'relative flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 min-w-0 flex-1',
      'transition-all duration-300 ease-viscous focus:outline-none',
      'focus-visible:ring-2 focus-visible:ring-white/50',
      disabled ? 'opacity-40' : 'active:scale-90',
      active ? 'text-white' : 'text-white/70 hover:text-white',
    ].join(' ');

  const IconShell = ({
    children,
    active,
  }: {
    children: ReactNode;
    active?: boolean;
  }) => (
    <span
      className={[
        'relative grid h-9 w-9 place-items-center rounded-xl transition-all duration-300 ease-viscous',
        active
          ? 'bg-white/95 text-gansid-primary shadow-[0_6px_16px_-6px_rgba(0,0,0,0.5)] ring-1 ring-white/60'
          : 'bg-white/[0.06] ring-1 ring-white/10',
      ].join(' ')}
      aria-hidden
    >
      {children}
    </span>
  );

  const label = (text: string) => (
    <span className="max-w-full truncate text-[10px] font-medium leading-none tracking-wide">
      {text}
    </span>
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pointer-events-none"
      >
        <div
          className="pointer-events-auto relative flex w-full max-w-md items-stretch gap-0.5 overflow-hidden rounded-[1.6rem] p-1.5"
          style={{
            // Gradient liquid glass: GANSID brand blue → purple, held translucent
            // so the glassmorphism (backdrop-blur) reads through it, plus a fine
            // white hairline + layered soft shadow. Opacity kept high enough
            // (~0.8–0.9) that the white icons/labels stay legible. Inline so the
            // whole treatment ships within components/Portal (no external CSS).
            backgroundImage:
              'linear-gradient(120deg, rgba(34,96,161,0.90) 0%, rgba(26,72,128,0.88) 42%, rgba(90,53,117,0.86) 78%, rgba(139,42,94,0.88) 100%)',
            backdropFilter: 'blur(22px) saturate(160%)',
            WebkitBackdropFilter: 'blur(22px) saturate(160%)',
            border: '1px solid rgba(255,255,255,0.20)',
            boxShadow:
              '0 20px 48px -16px rgba(18,58,107,0.6), inset 0 1px 0 0 rgba(255,255,255,0.22)',
          }}
        >
          {/* Subtle inner darkening from the bottom so white icons + labels keep
              strong contrast over the lighter (translucent) gradient. */}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-black/5 to-transparent"
            aria-hidden
          />
          {/* Home */}
          <Link
            to="/portal"
            aria-label="Home"
            aria-current={isHome ? 'page' : undefined}
            className={cellClass(isHome)}
          >
            <IconShell active={isHome}>
              <HomeIcon className="h-[22px] w-[22px]" />
            </IconShell>
            {label('Home')}
          </Link>

          {/* Tickets */}
          <Link
            to="/portal/tickets"
            aria-label="My Tickets"
            aria-current={isTickets ? 'page' : undefined}
            className={cellClass(isTickets)}
          >
            <IconShell active={isTickets}>
              <TicketIcon className="h-[22px] w-[22px]" />
            </IconShell>
            {label('Tickets')}
          </Link>

          {/* Quick Access items (up to 2) */}
          {inlineLinks.map((link) => {
            const Icon = iconForSidebarLink(link);
            const soon = link.mode === 'soon';

            const inner = (
              <>
                <IconShell>
                  {soon ? (
                    <ClockIcon className="h-[22px] w-[22px]" />
                  ) : (
                    <Icon className="h-[22px] w-[22px]" />
                  )}
                </IconShell>
                {label(link.label)}
              </>
            );

            if (soon) {
              return (
                <span
                  key={link.id}
                  aria-disabled
                  title={`${link.label} — coming soon`}
                  className={cellClass(false, true) + ' cursor-default'}
                >
                  {inner}
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
                  className={cellClass(false)}
                >
                  {inner}
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
                className={cellClass(false)}
              >
                {inner}
              </a>
            );
          })}

          {/* Menu → bottom sheet */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className={cellClass(false)}
          >
            <IconShell>
              <MenuIcon className="h-[22px] w-[22px]" />
            </IconShell>
            {label('Menu')}
          </button>
        </div>
      </nav>

      {iframeLink?.href && (
        <IframeViewer
          url={iframeLink.href}
          title={iframeLink.label}
          onClose={() => setIframeLink(null)}
        />
      )}
      {menuOpen && <PortalMenuSheet onClose={() => setMenuOpen(false)} />}
    </>
  );
}
