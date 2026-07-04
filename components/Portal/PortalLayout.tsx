import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { AuthNoticeBanner } from '../AuthNoticeBanner';
import { getSettings } from '../../services/storageService';
import { MenuIcon } from './Dashboard/navIcons';

/**
 * Only a trimmed http(s) URL renders as the header banner image. data:/blob:/
 * other URIs (e.g. SCAGO's base64 email_header_logo) fall through to the
 * brand-gradient wordmark header. Mirrors the email renderer + TicketDownload
 * page guard so the portal header stays consistent with the branded emails.
 */
function usableImageUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return /^https?:\/\//i.test(t) ? t : undefined;
}

export function PortalLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | undefined>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);

  // Pull the branded Congress header image used in emails, for visual
  // consistency across the app + inbox. Styling-only; falls back gracefully.
  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) setBannerUrl(usableImageUrl(s?.emailHeaderLogo));
      })
      .catch(() => {
        /* keep the gradient fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const avatar = (
    <Link
      to="/portal/profile"
      aria-label="Your profile"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gansid-primary-gradient font-display text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(186,0,40,0.7)] ring-2 ring-white transition-transform duration-300 ease-viscous hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-gansid-secondary/40"
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

      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl shadow-[0_8px_24px_-16px_rgba(26,28,28,0.35)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 py-2.5 sm:py-3">
          {bannerUrl ? (
            // Branded Congress header image (same asset as the emails).
            <Link
              to="/portal"
              aria-label="GANSID Congress 2026 — home"
              className="flex min-w-0 items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/40"
            >
              <img
                src={bannerUrl}
                alt="GANSID Congress 2026"
                className="h-14 w-auto max-w-[70vw] object-contain sm:h-16"
              />
            </Link>
          ) : (
            // Fallback: brand gradient + wordmark (the prior header treatment).
            <Link
              to="/portal"
              aria-label="GANSID Congress 2026 — home"
              className="flex min-w-0 items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/40"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gansid-primary-gradient text-sm font-black text-white shadow-md ring-1 ring-white/40">
                G
              </span>
              <span className="truncate bg-gansid-primary-gradient bg-clip-text font-display text-base font-bold tracking-tight text-transparent sm:text-lg">
                GANSID Congress 2026
              </span>
            </Link>
          )}

          <div className="flex items-center gap-2.5">
            {avatar}

            {/* Desktop-only hamburger pill → dropdown menu. On mobile the menu
                lives on the floating nav, so the header stays banner + avatar. */}
            <div ref={menuRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open menu"
                className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-3.5 py-2 text-gansid-on-surface shadow-[0_6px_16px_-10px_rgba(26,28,28,0.5)] transition-all duration-300 ease-viscous hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(26,28,28,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gansid-secondary/40"
              >
                <MenuIcon className="h-5 w-5 text-gansid-on-surface/70" />
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
        {/* Thin brand gradient rail grounds the clean white bar. */}
        <div className="h-[3px] w-full bg-gansid-primary-gradient" aria-hidden />
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AuthNoticeBanner className="!px-0 !pt-0 !pb-4" />
        <Outlet />
      </main>
    </div>
  );
}
