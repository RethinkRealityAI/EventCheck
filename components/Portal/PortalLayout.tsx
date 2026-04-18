import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

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
    <div className="portal-root min-h-screen bg-gansid-surface">
      <header className="relative bg-white/80 backdrop-blur-viscous sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="absolute top-0 inset-x-0 h-1 bg-gansid-primary-gradient" />
        <Link to="/portal" className="font-display font-bold text-lg">GANSID Portal</Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="h-10 w-10 rounded-full bg-gansid-primary-gradient text-white font-display flex items-center justify-center"
          >
            {initials}
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 glass rounded-gansid-lg p-2 min-w-[200px] shadow-invisible-lift">
              <Link to="/portal/profile" onClick={() => setMenuOpen(false)} className="block px-3 py-2 hover:bg-gansid-surface-container-low rounded">Profile</Link>
              {profile?.role === 'admin' && (
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
        <Outlet />
      </main>
    </div>
  );
}
