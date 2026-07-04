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

  // Role → credential label + gradient, mirroring CredentialCard.tsx so the
  // header pill reads the same standing as the (desktop) credential card.
  const credentialLabel =
    profile?.role === 'exhibitor' ? 'Exhibitor'
    : profile?.role === 'sponsor' ? 'Sponsor'
    : profile?.role === 'super_admin' ? 'Super Admin'
    : profile?.role === 'admin' ? 'Admin'
    : 'Attendee';
  const credentialGradient =
    profile?.role === 'exhibitor' ? 'linear-gradient(135deg,#8b2a5e 0%,#5a3575 100%)'
    : profile?.role === 'sponsor' ? 'linear-gradient(135deg,#2260a1 0%,#1a4880 100%)'
    : profile?.role === 'super_admin' ? 'linear-gradient(135deg,#78350f 0%,#b45309 100%)'
    : profile?.role === 'admin' ? 'linear-gradient(135deg,#0f172a 0%,#1a4880 100%)'
    : 'linear-gradient(135deg,#ba0028 0%,#E0243C 60%,#2260a1 100%)';

  // The initials avatar + a small credential pill beneath it — both link to the
  // profile page. Frosted glass ring so it reads cleanly against the blue
  // header gradient. The pill gives mobile a credential presence now that the
  // dashboard credential card is desktop-only.
  const avatar = (
    <Link
      to="/portal/profile"
      aria-label={`Your profile — ${credentialLabel}`}
      className="group flex shrink-0 flex-col items-center gap-1 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 font-display text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.55)] ring-2 ring-white/45 backdrop-blur-sm transition-transform duration-300 ease-viscous group-hover:scale-105">
        {initials}
      </span>
      <span
        className="max-w-[104px] truncate rounded-full px-2.5 py-[3px] text-center font-display text-[9px] font-bold uppercase leading-none tracking-[0.08em] text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.5)] ring-1 ring-white/25"
        style={{ backgroundImage: credentialGradient }}
      >
        {credentialLabel}
      </span>
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

      {/* scroll-mt-24 keeps any programmatic scroll-to-top / #anchor target from
          hiding beneath the sticky header. The content scrolls on the document,
          so the sticky header now reserves its own space above <main>. */}
      <main className="mx-auto max-w-7xl scroll-mt-24 px-6 pb-8 pt-6">
        <AuthNoticeBanner className="!px-0 !pt-0 !pb-4" />
        <Outlet />
      </main>
    </div>
  );
}
