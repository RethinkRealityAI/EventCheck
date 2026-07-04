import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { AuthNoticeBanner } from '../AuthNoticeBanner';

export function PortalLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (profile?.fullName ?? profile?.email ?? 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="portal-root min-h-screen relative overflow-hidden">
      {/* Pure white base */}
      <div className="absolute inset-0 bg-white -z-10" />
      {/* Very subtle hue accents tucked into the bottom corners */}
      <div className="absolute -bottom-48 -left-32 w-[500px] h-[500px] rounded-full bg-gansid-primary opacity-[0.07] blur-3xl -z-10" />
      <div className="absolute -bottom-48 -right-32 w-[500px] h-[500px] rounded-full bg-gansid-secondary opacity-[0.07] blur-3xl -z-10" />

      <header className="relative bg-gansid-primary-gradient text-white sticky top-0 z-40 px-5 sm:px-6 py-4 flex items-center justify-between shadow-[0_10px_30px_-12px_rgba(186,0,40,0.55)]">
        {/* Fine top hairline + soft interior sheen for depth on the gradient */}
        <div className="pointer-events-none absolute top-0 inset-x-0 h-px bg-white/40" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_15%_-40%,rgba(255,255,255,0.28),transparent_55%)]" />
        <Link
          to="/portal"
          className="relative font-display font-bold text-lg sm:text-xl tracking-tight text-white drop-shadow-sm flex items-center gap-2.5"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm text-sm font-black">G</span>
          <span>GANSID Congress 2026</span>
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open account menu"
            className="h-10 w-10 rounded-full bg-white text-gansid-primary font-display font-bold flex items-center justify-center shadow-lg ring-2 ring-white/70 transition-transform duration-300 ease-viscous hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
          >
            {initials}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 glass rounded-gansid-lg p-2 min-w-[200px] shadow-invisible-lift text-gansid-on-surface">
              <Link to="/portal/tickets" onClick={() => setMenuOpen(false)} className="block px-3 py-2 hover:bg-gansid-surface-container-low rounded">My Tickets</Link>
              <Link to="/portal/profile" onClick={() => setMenuOpen(false)} className="block px-3 py-2 hover:bg-gansid-surface-container-low rounded">Profile</Link>
              {(profile?.role === 'admin' || profile?.role === 'super_admin') && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="block px-3 py-2 hover:bg-gansid-surface-container-low rounded">Admin Dashboard</Link>
              )}
              <button
                type="button"
                onClick={async () => { setMenuOpen(false); await signOut(); navigate('/'); }}
                className="block w-full text-left px-3 py-2 hover:bg-gansid-surface-container-low rounded text-gansid-primary"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <AuthNoticeBanner className="!px-0 !pt-0 !pb-4" />
        <Outlet />
      </main>
    </div>
  );
}
