import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { AuthNoticeBanner } from '../AuthNoticeBanner';
import { MenuIcon } from './Dashboard/navIcons';

export function PortalLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
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

  // The initials avatar — a Link to the profile page (NOT a menu toggle).
  // Frosted glass ring so it reads cleanly against the blue header gradient.
  const avatar = (
    <Link
      to="/portal/profile"
      aria-label="Your profile"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 font-display text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.55)] ring-2 ring-white/45 backdrop-blur-sm transition-transform duration-300 ease-viscous hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60"
    >
      {initials}
    </Link>
  );

  return (
    <div className="portal-root min-h-screen relative overflow-hidden">
      {/* Pure white base */}
      <div className="absolute inset-0 bg-white -z-10" />
      {/* Very subtle hue accents tucked into the bottom corners */}
      <div className="absolute -bottom-48 -left-32 w-[500px] h-[500px] rounded-full bg-gansid-primary opacity-[0.07] blur-3xl -z-10" />
      <div className="absolute -bottom-48 -right-32 w-[500px] h-[500px] rounded-full bg-gansid-secondary opacity-[0.07] blur-3xl -z-10" />

      <header
        className="sticky top-0 z-40 shadow-[0_10px_30px_-16px_rgba(18,58,107,0.7)]"
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
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 py-2.5 sm:py-3">
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
              className="h-10 w-auto max-w-[62vw] object-contain object-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.28)] sm:h-[46px] lg:h-[50px]"
            />
          </Link>

          <div className="flex items-center gap-2.5">
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
        {/* Thin bright top accent rail — a crisp highlight that grounds the
            premium blue bar. */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-white/50 via-white/70 to-white/30"
          aria-hidden
        />
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AuthNoticeBanner className="!px-0 !pt-0 !pb-4" />
        <Outlet />
      </main>
    </div>
  );
}
