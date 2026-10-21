import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { AuthNoticeBanner } from '../AuthNoticeBanner';
import { MenuIcon } from './Dashboard/navIcons';
import { PortalQuickNav } from './Dashboard/PortalQuickNav';
import { usePortalContent } from './content/ContentProvider';
import { useUpdates } from './Updates/useUpdates';
import { greetingName } from '../../utils/greetingName';
import { VirtualSessionsProvider, useVirtualSessions } from './Virtual/VirtualSessionsContext';

/**
 * Wraps the portal in VirtualSessionsProvider so the header menu, home card,
 * programme and detail screens share one load of the virtual-session data.
 */
export function PortalLayout() {
  return (
    <VirtualSessionsProvider>
      <PortalLayoutInner />
    </VirtualSessionsProvider>
  );
}

function PortalLayoutInner() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { intro } = usePortalContent();
  const { unread } = useUpdates();
  const { canSee: canSeeVirtual } = useVirtualSessions();
  const [menuOpen, setMenuOpen] = useState(false);
  // Home carries the greeting inside the blue header; every other screen gets
  // the compact bar only.
  const isHome = pathname === '/portal' || pathname === '/portal/';
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the desktop menu on outside-click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const initials = (profile?.fullName ?? profile?.email ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  // Plain frosted initials disc (the new design drops the role pill).
  const avatar = (
    <Link
      to="/portal/profile"
      aria-label="Your profile"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 font-display text-[13px] font-bold text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.45),0_8px_20px_-8px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-transform duration-300 ease-viscous active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      {initials}
    </Link>
  );

  // Updates bell — unread count from the same store the home Updates card uses.
  const bell = (
    <Link
      to="/portal/updates"
      aria-label={unread.length ? `Updates, ${unread.length} unread` : 'Updates'}
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm transition-transform duration-300 ease-viscous active:scale-[0.92] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <Bell className="h-[21px] w-[21px]" strokeWidth={1.75} aria-hidden />
      {unread.length > 0 && (
        <span className="absolute right-1.5 top-1.5 h-[17px] min-w-[17px] rounded-full bg-[linear-gradient(135deg,#ba0028,#E0243C)] px-1 text-center font-display text-[10px] font-bold leading-[17px] text-white shadow-[0_0_0_2px_rgba(15,51,95,0.9)]">
          {unread.length}
        </span>
      )}
    </Link>
  );

  return (
    <div className="portal-root relative min-h-screen">
      {/* Decorative background layer. IMPORTANT: the `overflow-hidden` that clips
          these blur blobs lives HERE, on a self-contained -z-10 layer — NOT on
          the page root. Putting overflow-hidden on the scrolling root made the
          sticky header overlap the first content block (content clipped beneath
          the header on dashboard / tickets). Isolating the clip keeps the
          document scroll clean so `position: sticky` reserves space correctly. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Pure white base */}
        <div className="absolute inset-0 bg-white" />
        {/* Very subtle hue accents tucked into the bottom corners */}
        <div className="absolute -bottom-48 -left-32 h-[500px] w-[500px] rounded-full bg-gansid-primary opacity-[0.07] blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[500px] w-[500px] rounded-full bg-gansid-secondary opacity-[0.07] blur-3xl" />
      </div>

      <header
        className={`${isHome ? 'relative' : 'sticky top-0'} z-40 shadow-[0_12px_34px_-18px_rgba(18,58,107,0.85)]`}
        style={{
          // Blue-DOMINANT GANSID gradient: deep navy → brand blue across most of
          // the bar, with only a subtle warm purple/red accent bleeding in at the
          // far right for depth. Reads unmistakably blue + premium.
          backgroundImage:
            'linear-gradient(118deg, #0f335f 0%, #123a6b 34%, #1a4880 58%, #2260a1 82%, #6d2a63 118%)',
        }}
      >
        {/* Soft inner top highlight for a glassy, lit-from-above finish. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.10] to-transparent"
          aria-hidden
        />
        <div className={`relative mx-auto max-w-7xl px-[18px] sm:px-6 ${isHome ? 'pb-4 pt-3' : 'py-2.5 sm:py-3'}`}>
        <div className="flex items-center justify-between gap-3">
          {/* White transparent Congress logo — the branded asset (served from
              public/). object-contain + max-width so it never overflows on
              narrow phones. Tappable → portal home. */}
          <Link
            to="/portal"
            aria-label="GANSID Congress 2026 — home"
            className="flex min-w-0 items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <img
              src="/branding/gansid/congress-logo-white.png"
              alt="GANSID Congress 2026"
              className="h-[38px] w-auto max-w-[62vw] object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.28)] sm:h-[44px] lg:h-[48px]"
            />
          </Link>

          <div className="flex items-center gap-2.5">
            {bell}
            {avatar}

            {/* Desktop-only hamburger pill → dropdown menu. On mobile the menu
                lives on the floating nav, so the header stays logo + avatar. */}
            <div ref={menuRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open menu"
                className="flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3.5 py-2 text-white shadow-[0_6px_16px_-10px_rgba(0,0,0,0.6)] backdrop-blur-sm transition-all duration-300 ease-viscous hover:-translate-y-0.5 hover:bg-white/25 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <MenuIcon className="h-5 w-5 text-white/90" />
                <span className="font-display text-sm font-semibold">Menu</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 min-w-[210px] rounded-gansid-lg bg-white p-2 text-gansid-on-surface shadow-[0_24px_50px_-18px_rgba(26,28,28,0.5)] ring-1 ring-black/[0.05]"
                >
                  <Link
                    to="/portal/tickets"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-3 py-2.5 font-display text-sm font-medium transition-colors hover:bg-gansid-surface-container-low"
                  >
                    My Tickets
                  </Link>
                  {canSeeVirtual && (
                    <Link
                      to="/portal/virtual"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-xl px-3 py-2.5 font-display text-sm font-medium transition-colors hover:bg-gansid-surface-container-low"
                    >
                      Virtual presentation
                    </Link>
                  )}
                  <Link
                    to="/portal/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-3 py-2.5 font-display text-sm font-medium transition-colors hover:bg-gansid-surface-container-low"
                  >
                    Profile
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-xl px-3 py-2.5 font-display text-sm font-medium transition-colors hover:bg-gansid-surface-container-low"
                    >
                      Admin Dashboard
                    </Link>
                  )}
                  <div className="my-1 h-px bg-gansid-on-surface/[0.07]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={async () => {
                      setMenuOpen(false);
                      await signOut();
                      navigate('/');
                    }}
                    className="block w-full rounded-xl px-3 py-2.5 text-left font-display text-sm font-semibold text-gansid-primary transition-colors hover:bg-gansid-primary/[0.06]"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {isHome && (
          <div className="mt-4">
            <div className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
              {intro?.heading?.trim() || 'Welcome back'}
            </div>
            <div className="mt-0.5 font-display text-[30px] font-bold leading-[1.1] tracking-[-0.02em] text-white">
              {greetingName(profile?.fullName, profile?.email)}
            </div>
          </div>
        )}
        </div>
        {/* Thin bright top accent rail — a crisp highlight that grounds the
            premium blue bar. */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-white/50 via-white/70 to-white/30"
          aria-hidden
        />
      </header>

      {/* scroll-mt-24 keeps any programmatic scroll-to-top / #anchor target from
          hiding beneath the sticky header. The content scrolls on the document,
          so the sticky header now reserves its own space above <main>. */}
      <main className="mx-auto max-w-7xl scroll-mt-24 px-6 pb-28 pt-6 lg:pb-8">
        <AuthNoticeBanner className="!px-0 !pt-0 !pb-4" />
        <Outlet />
      </main>
      {/* Mobile bottom bar on every portal screen (was home-only), so the
          Programme, Speakers and detail screens keep their navigation. */}
      <PortalQuickNav />
    </div>
  );
}
