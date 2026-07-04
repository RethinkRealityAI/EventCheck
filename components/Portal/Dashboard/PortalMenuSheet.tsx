import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { usePortalContent } from '../content/ContentProvider';
import { IframeViewer } from '../ui/IframeViewer';
import type { SidebarLink } from '../../../types';
import { X } from 'lucide-react';
import {
  UserIcon,
  TicketIcon,
  ShieldIcon,
  LogoutIcon,
  ClockIcon,
  ChevronRightIcon,
  iconForSidebarLink,
} from './navIcons';

/**
 * Premium mobile bottom-sheet menu opened from the floating nav's "Menu" item.
 * Portals to document.body (fixed-position modals must, per repo rule) with a
 * frosted scrim + a rounded, glassy sheet that slides up from the bottom.
 *
 * Comprehensive nav: Profile + My Tickets, then EVERY CMS `sidebarLink`
 * (Congress website, Program, Venue & Travel, Congress Materials…) so Venue and
 * the Congress site are reachable here, then Admin (admins only) + Sign Out.
 * Each Quick Access item keeps its behaviour: external link (`target="_top"`),
 * iframe (opens {@link IframeViewer}), or a dimmed "soon" placeholder.
 *
 * Styling-only wrapper around existing auth actions — no business logic beyond
 * the same signOut()+navigate('/') the header menu already performs.
 */
export function PortalMenuSheet({ onClose }: { onClose: () => void }) {
  const { profile, signOut } = useAuth();
  const { sidebarLinks } = usePortalContent();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const [iframeLink, setIframeLink] = useState<SidebarLink | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock body scroll while the sheet is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const initials = (profile?.fullName ?? profile?.email ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const rowClass =
    'group flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors duration-200 active:bg-black/[0.04]';
  const iconWrap =
    'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gansid-primary-gradient text-white shadow-[0_8px_18px_-8px_rgba(186,0,40,0.6)] ring-1 ring-white/25';

  // Shared inner content for a Quick Access row: gradient icon chip + label
  // (+ optional description) + trailing chevron.
  const linkRowInner = (link: SidebarLink, Icon: (p: any) => ReactNode, soon: boolean) => (
    <>
      <span className={soon ? `${iconWrap} opacity-70` : iconWrap} aria-hidden>
        {soon ? <ClockIcon className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-display text-[15px] font-semibold text-gansid-on-surface">
          {link.label}
          {soon && (
            <span className="rounded-full bg-gansid-on-surface/[0.06] px-1.5 py-0.5 font-body text-[9px] font-bold uppercase tracking-wide text-gansid-on-surface/45">
              Soon
            </span>
          )}
        </span>
        {link.description && (
          <span className="mt-0.5 block truncate font-body text-xs text-gansid-on-surface/50">
            {link.description}
          </span>
        )}
      </span>
      {!soon && (
        <ChevronRightIcon
          className="h-4.5 w-4.5 shrink-0 text-gansid-on-surface/30 transition-transform duration-300 ease-viscous group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </>
  );

  return createPortal(
    <div
      className="lg:hidden fixed inset-0 z-[110] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Portal menu"
    >
      {/* Scoped slide-up keyframes — inline so the sheet ships self-contained
          within components/Portal (no external stylesheet dependency). */}
      <style>{`
        @keyframes portalSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .portal-sheet-up { animation: portalSheetUp 320ms cubic-bezier(0.32, 0.72, 0, 1); }
      `}</style>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-gansid-on-surface/40 backdrop-blur-[3px] animate-fade-in"
      />

      {/* Sheet */}
      <div
        className="portal-sheet-up relative flex max-h-[88dvh] w-full flex-col rounded-t-[1.75rem] bg-white/95 backdrop-blur-2xl ring-1 ring-black/5 shadow-[0_-24px_60px_-20px_rgba(26,28,28,0.5)] pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {/* Grabber */}
        <div className="flex justify-center pt-3 pb-1.5">
          <span className="h-1.5 w-11 rounded-full bg-gansid-on-surface/15" aria-hidden />
        </div>

        {/* Identity header */}
        <div className="flex items-center gap-3.5 px-5 pt-2 pb-4">
          <Link
            to="/portal/profile"
            onClick={onClose}
            aria-label="Open your profile"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gansid-primary-gradient font-display text-base font-bold text-white shadow-md ring-2 ring-white"
          >
            {initials}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-bold leading-tight text-gansid-on-surface truncate">
              {profile?.fullName ?? profile?.email}
            </div>
            <div className="font-body text-xs capitalize text-gansid-on-surface/55">
              {profile?.role || 'Attendee'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-full bg-gansid-on-surface/[0.05] text-gansid-on-surface/60 transition-colors hover:bg-gansid-on-surface/10"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="mx-5 h-px bg-gansid-on-surface/[0.07]" />

        {/* Actions — scrollable so a long link list never overflows the sheet. */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pt-2.5">
          <Link to="/portal/profile" onClick={onClose} className={rowClass}>
            <span className={iconWrap} aria-hidden>
              <UserIcon className="h-5 w-5" />
            </span>
            <span className="flex-1 font-display text-[15px] font-semibold text-gansid-on-surface">
              Profile
            </span>
            <ChevronRightIcon className="h-4.5 w-4.5 text-gansid-on-surface/30 transition-transform duration-300 ease-viscous group-hover:translate-x-0.5" aria-hidden />
          </Link>

          <Link to="/portal/tickets" onClick={onClose} className={rowClass}>
            <span className={iconWrap} aria-hidden>
              <TicketIcon className="h-5 w-5" />
            </span>
            <span className="flex-1 font-display text-[15px] font-semibold text-gansid-on-surface">
              My Tickets
            </span>
            <ChevronRightIcon className="h-4.5 w-4.5 text-gansid-on-surface/30 transition-transform duration-300 ease-viscous group-hover:translate-x-0.5" aria-hidden />
          </Link>

          {/* CMS Quick Access links — Congress website, Program, Venue & Travel,
              Congress Materials, etc. */}
          {(sidebarLinks ?? []).length > 0 && (
            <div className="my-1.5 px-4">
              <span className="font-body text-[10px] font-bold uppercase tracking-[0.16em] text-gansid-on-surface/35">
                Congress
              </span>
            </div>
          )}
          {(sidebarLinks ?? []).map((link) => {
            const Icon = iconForSidebarLink(link);
            const soon = link.mode === 'soon';

            if (soon) {
              return (
                <span
                  key={link.id}
                  aria-disabled
                  title={`${link.label} — coming soon`}
                  className={`${rowClass} cursor-default opacity-50`}
                >
                  {linkRowInner(link, Icon, true)}
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
                  className={rowClass}
                >
                  {linkRowInner(link, Icon, false)}
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
                onClick={onClose}
                className={rowClass}
              >
                {linkRowInner(link, Icon, false)}
              </a>
            );
          })}

          <div className="mx-2 my-1.5 h-px bg-gansid-on-surface/[0.07]" />

          {isAdmin && (
            <Link to="/admin" onClick={onClose} className={rowClass}>
              <span className={iconWrap} aria-hidden>
                <ShieldIcon className="h-5 w-5" />
              </span>
              <span className="flex-1 font-display text-[15px] font-semibold text-gansid-on-surface">
                Admin Dashboard
              </span>
              <ChevronRightIcon className="h-4.5 w-4.5 text-gansid-on-surface/30 transition-transform duration-300 ease-viscous group-hover:translate-x-0.5" aria-hidden />
            </Link>
          )}

          <button
            type="button"
            onClick={async () => {
              onClose();
              await signOut();
              navigate('/');
            }}
            className={rowClass}
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gansid-on-surface/[0.06] text-gansid-primary ring-1 ring-black/[0.04]"
              aria-hidden
            >
              <LogoutIcon className="h-5 w-5" />
            </span>
            <span className="flex-1 font-display text-[15px] font-semibold text-gansid-primary">
              Sign Out
            </span>
          </button>
        </nav>
      </div>

      {iframeLink?.href && (
        <IframeViewer
          url={iframeLink.href}
          title={iframeLink.label}
          onClose={() => setIframeLink(null)}
        />
      )}
    </div>,
    document.body,
  );
}
