import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, QrCode, ClipboardList, LogOut, Settings as SettingsIcon, ExternalLink, Menu, X, ChevronLeft, ChevronRight, Loader2, Rows3, Users, Handshake } from 'lucide-react';
import ManualTicketTool from './components/ManualTicketTool';
import AttendeeList from './components/AttendeeList';
import Scanner from './components/Scanner';
import FormsManager from './components/FormsManager';
import FormBuilder from './components/FormBuilder';
import Settings from './components/Settings';
import PublicRegistration from './components/PublicRegistration';
import SeatingConfigurator from './components/Seating/SeatingConfigurator';
import SponsorsDashboard from './components/Sponsors/SponsorsDashboard';
import { NotificationProvider } from './components/NotificationSystem';
import { Attendee, Form } from './types';
import { getAttendees, checkInAttendee, getForms } from './services/storageService';
import { AuthProvider, useAuth } from './components/AuthContext';
import Login from './components/Login';
import { CURRENT_SITE } from './config/sites';
import { Landing } from './components/Portal/Landing/Landing';
import { PortalLayout } from './components/Portal/PortalLayout';
import { PortalDashboard } from './components/Portal/Dashboard/PortalDashboard';
import { ProfilePage } from './components/Portal/Profile/ProfilePage';
import { ResetPasswordPage } from './components/Portal/ResetPassword/ResetPasswordPage';

const NavLink = ({ to, icon: Icon, children, collapsed }: { to: string, icon: any, children?: React.ReactNode, collapsed?: boolean }) => {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to) && (to !== '/admin' || location.pathname === '/admin');

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all group ${isActive
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        } ${collapsed ? 'justify-center' : ''}`}
      title={typeof children === 'string' ? children : ''}
    >
      <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : ''}`} />
      <span className={`font-medium whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>{children}</span>
    </Link>
  );
};

const DashboardStats = ({ attendees }: { attendees: Attendee[] }) => {
  const total = attendees.length;
  const primaryAttendees = attendees.filter(a => a.isPrimary !== false);
  const guestCount = attendees.filter(a => a.isPrimary === false).length;
  const checkedIn = attendees.filter(a => a.checkedInAt).length;
  const percentage = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  const totalDonatedSeats = primaryAttendees.reduce((acc, curr) => acc + (Number(curr.donatedSeats) || 0), 0);
  const totalDonatedTables = primaryAttendees.reduce((acc, curr) => acc + (Number(curr.donatedTables) || 0), 0);
  const recentDonors = primaryAttendees
    .filter(a => (a.donatedSeats || 0) > 0 || (a.donatedTables || 0) > 0)
    .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8 mb-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-3xl shadow-xl shadow-indigo-500/10 border border-white/60 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
            <Users className="w-16 h-16 transform right-[-10px] top-[-10px]" />
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Total Registrations</h3>
          <p className="text-4xl font-extrabold text-slate-800 drop-shadow-sm">{primaryAttendees.length}</p>
          {guestCount > 0 && <p className="text-xs text-indigo-600 font-semibold mt-2 bg-indigo-50 inline-block px-2 py-1 rounded-md">+ {guestCount} guest ticket{guestCount !== 1 ? 's' : ''}</p>}
        </div>
        <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-3xl shadow-xl shadow-indigo-500/10 border border-white/60 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
             <LayoutDashboard className="w-16 h-16 transform right-[-10px] top-[-10px]" />
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Live Attendance</h3>
          <div className="flex items-baseline gap-2 drop-shadow-sm">
            <p className="text-4xl font-extrabold text-indigo-600">{checkedIn}</p>
            <span className="text-sm font-bold text-slate-400">/ {total}</span>
          </div>
          <div className="w-full bg-indigo-100 rounded-full h-2 mt-4 overflow-hidden border border-indigo-200/50">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2 rounded-full transition-all duration-1000 ease-out" style={{ width: `${percentage}%` }}></div>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-3xl shadow-xl shadow-indigo-500/10 border border-white/60 hover:shadow-2xl hover:shadow-indigo-500/20 transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-300">
             <QrCode className="w-16 h-16 transform right-[-10px] top-[-10px]" />
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Check-in Rate</h3>
          <p className="text-4xl font-extrabold text-slate-800 drop-shadow-sm">{percentage}%</p>
        </div>
        <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-3xl shadow-xl shadow-emerald-500/10 border border-white/60 hover:shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-300 text-emerald-600">
             <Rows3 className="w-16 h-16 transform right-[-10px] top-[-10px]" />
          </div>
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Donated Seats</h3>
          <p className="text-4xl font-extrabold text-emerald-600 drop-shadow-sm">{totalDonatedSeats}</p>
          <p className="text-xs text-emerald-700 font-semibold mt-2 bg-emerald-50 inline-block px-2 py-1 rounded-md">
            {totalDonatedTables > 0 ? `${totalDonatedTables} table${totalDonatedTables !== 1 ? 's' : ''} · ${totalDonatedSeats} seat${totalDonatedSeats !== 1 ? 's' : ''} donated` : `seats donated for others`}
          </p>
        </div>
      </div>

      {/* Recent Seat Donors List */}
      {recentDonors.length > 0 && (
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-indigo-500/5 border border-white/60 overflow-hidden mt-8 transform hover:-translate-y-1 transition-all duration-300">
          <div className="px-6 py-5 border-b border-white/40 bg-white/50 backdrop-blur-md flex justify-between items-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent z-0 pointer-events-none"></div>
            <h3 className="font-extrabold text-slate-800 text-lg relative z-10 flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-600 p-1.5 rounded-xl">🪑</span> Recent Seat Donors
            </h3>
            <Link to="/admin" className="text-xs text-indigo-600 font-bold hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors relative z-10 shadow-sm border border-indigo-100">View All</Link>
          </div>
          <div className="divide-y divide-gray-100/50 bg-white/30">
            {recentDonors.map(d => (
              <div key={d.id} className="p-4 px-6 flex justify-between items-center hover:bg-white/80 transition-colors group cursor-pointer relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-center"></div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shadow-sm border border-emerald-100/50 group-hover:scale-110 transition-transform">
                    {d.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{d.name}</div>
                    <div className="text-xs font-medium text-slate-400 mt-0.5">{new Date(d.registeredAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="text-emerald-600 font-extrabold bg-emerald-50 px-3 py-1.5 rounded-xl shadow-sm border border-emerald-100/50 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  {d.donationType === 'table' && (d.donatedTables || 0) > 0
                    ? `+${d.donatedTables} table${(d.donatedTables || 0) !== 1 ? 's' : ''} (${d.donatedSeats} seats)`
                    : `+${d.donatedSeats} seat${(d.donatedSeats || 0) !== 1 ? 's' : ''}`
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminLayout = () => {
  const { signOut } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  // Refresh data whenever route might have changed data or periodically
  const refreshAttendees = useCallback(async () => {
    try {
      const [data, formsData] = await Promise.all([getAttendees(), getForms()]);
      setAttendees(data);
      setForms(formsData);
    } catch (error) {
      console.error("Failed to fetch attendees", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAttendees();
    const interval = setInterval(refreshAttendees, 5000);
    return () => clearInterval(interval);
  }, [refreshAttendees]);

  const handleScan = async (data: string): Promise<Attendee | 'not_found' | 'already_checked_in'> => {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.id) return 'not_found';

      // Check if already checked in locally first for faster UI response
      const existingInState = attendees.find(a => a.id === parsed.id);
      if (existingInState?.checkedInAt) return 'already_checked_in';

      const result = await checkInAttendee(parsed.id);

      if (!result) return 'not_found';
      if (result.alreadyCheckedIn) return 'already_checked_in';

      const attendee = result.attendee;

      setAttendees(prev => {
        const index = prev.findIndex(a => a.id === attendee.id);
        if (index !== -1) {
          return prev.map(a => a.id === attendee.id ? attendee : a);
        } else {
          return [attendee, ...prev];
        }
      });
      return attendee;

    } catch (e) {
      return 'not_found';
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50/80 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-blue-100/40 rounded-full blur-[120px] pointer-events-none transform translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-indigo-100/40 rounded-full blur-[120px] pointer-events-none transform -translate-x-1/3 translate-y-1/3"></div>
      {/* Mobile Floating Bottom Nav */}
      <div className="lg:hidden fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center">
        {isMobileMenuOpen && (
          <div className="bg-slate-900/80 backdrop-blur-2xl p-2 rounded-2xl shadow-2xl shadow-indigo-900/20 border border-slate-700/50 flex items-center gap-2 mb-4 animate-in slide-in-from-bottom-4 zoom-in-95 duration-200">
            <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
              <LayoutDashboard className="w-6 h-6" />
            </Link>
            <Link to="/admin/forms" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
              <ClipboardList className="w-6 h-6" />
            </Link>
            <Link to="/admin/seating" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
              <Rows3 className="w-6 h-6" />
            </Link>
            <Link to="/admin/sponsors" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
              <Handshake className="w-6 h-6" />
            </Link>
            <button onClick={() => { setShowScanner(true); setIsMobileMenuOpen(false); }} className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all">
              <QrCode className="w-6 h-6" />
            </button>
            <Link to="/admin/settings" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
              <SettingsIcon className="w-6 h-6" />
            </Link>
            <button onClick={handleLogout} className="p-3 text-red-400 hover:bg-slate-800/80 rounded-xl transition-all">
              <LogOut className="w-6 h-6" />
            </button>
          </div>
        )}
        
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className={`p-4 rounded-full shadow-2xl transition-all duration-300 transform border border-white/10 ${isMobileMenuOpen ? 'bg-slate-800 text-white rotate-90 scale-95' : 'bg-indigo-600 text-white hover:scale-105 shadow-indigo-500/30'}`}
        >
           {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 hidden lg:flex flex-col transition-all duration-300
          ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-20' : 'w-72'}
          bg-slate-900/95 backdrop-blur-xl border-r border-slate-800 shadow-2xl
        `}
        onMouseEnter={() => !isSidebarPinned && setIsSidebarCollapsed(false)}
        onMouseLeave={() => !isSidebarPinned && setIsSidebarCollapsed(true)}
      >
        <div className={`p-6 flex items-center ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center transition-none' : 'justify-between'} transition-all duration-300`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className="p-2 rounded-lg shadow-lg flex-shrink-0"
              style={{
                backgroundColor: CURRENT_SITE.fallbackColors.primary,
                boxShadow: `0 10px 15px -3px ${CURRENT_SITE.fallbackColors.primary}4D`,
              }}
            >
              {CURRENT_SITE.logoImage ? (
                <img src={CURRENT_SITE.logoImage} alt={CURRENT_SITE.displayName} className="w-6 h-6 object-contain" />
              ) : (
                <QrCode className="w-6 h-6 text-white" />
              )}
            </div>
            <div className={`transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
              <h1 className="text-xl font-bold text-white tracking-tight whitespace-nowrap">
                {CURRENT_SITE.displayName}
              </h1>
              <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">{CURRENT_SITE.adminSubtitle}</p>
            </div>
          </div>

          <button
            onClick={() => setIsSidebarPinned(!isSidebarPinned)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hidden lg:flex ${isSidebarPinned
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
              : 'bg-slate-800 text-slate-400 hover:text-white'
              } ${(isSidebarCollapsed && !isSidebarPinned) ? 'hidden' : ''}`}
            title={isSidebarPinned ? "Unpin Sidebar" : "Pin Sidebar"}
          >
            <span className="text-[10px] font-bold uppercase tracking-tight">{isSidebarPinned ? 'Pinned' : 'Pin'}</span>
            {isSidebarPinned ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-2 mt-4 lg:mt-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <NavLink to="/admin" icon={LayoutDashboard} collapsed={isSidebarCollapsed && !isSidebarPinned}>Dashboard</NavLink>
          <NavLink to="/admin/forms" icon={ClipboardList} collapsed={isSidebarCollapsed && !isSidebarPinned}>Manage Forms</NavLink>
          <NavLink to="/admin/sponsors" icon={Handshake} collapsed={isSidebarCollapsed && !isSidebarPinned}>Sponsors</NavLink>
          <NavLink to="/admin/seating" icon={Rows3} collapsed={isSidebarCollapsed && !isSidebarPinned}>Seating Chart</NavLink>
          <NavLink to="/admin/generate-qr" icon={QrCode} collapsed={isSidebarCollapsed && !isSidebarPinned}>Generate QR</NavLink>
          <NavLink to="/admin/settings" icon={SettingsIcon} collapsed={isSidebarCollapsed && !isSidebarPinned}>Settings</NavLink>

          <div className="pt-4 mt-4 border-t border-slate-700/50 mx-2">
            <button
              onClick={() => { setShowScanner(true); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center bg-indigo-500/10 text-indigo-400' : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-900/20'
                }`}
              title="Scan Tickets"
            >
              <QrCode className={`w-5 h-5 transition-transform group-hover:scale-110 ${(isSidebarCollapsed && !isSidebarPinned) ? '' : 'text-white'}`} />
              <span className={`font-medium whitespace-nowrap transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Scan Tickets</span>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div
            onClick={handleLogout}
            className={`flex items-center gap-3 px-3 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl cursor-pointer transition-all ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center transition-none' : ''}`} title="Logout"
          >
            <LogOut className="w-5 h-5" />
            <span className={`font-medium whitespace-nowrap transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Logout</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto pb-28 lg:pb-0 pt-4 lg:pt-0 transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'lg:pl-20' : 'lg:pl-72'}`}>
        <div className="p-4 lg:p-6 w-full mx-auto">
          <Routes>
            <Route path="/" element={
              <>
                <header className="mb-8 flex justify-between items-center bg-gradient-to-r from-indigo-600 to-indigo-800 p-8 rounded-3xl shadow-2xl shadow-indigo-600/20 text-white relative overflow-hidden border border-indigo-500/30">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                  <div className="absolute -right-10 -top-20 opacity-20 transform rotate-12 scale-150 pointer-events-none">
                    <LayoutDashboard strokeWidth={1.5} className="w-64 h-64 text-white" />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 border border-white/20 shadow-sm text-indigo-50">
                      LIVE EVENT HUB
                    </div>
                    <h2 className="text-4xl font-extrabold text-white mb-2 drop-shadow-md tracking-tight">Event Dashboard</h2>
                    <p className="text-indigo-100 font-medium tracking-wide text-lg max-w-lg">
                      Real-time overview of attendance, ticket statuses, and analytics.
                    </p>
                  </div>
                </header>
                <DashboardStats attendees={attendees} />
                <AttendeeList attendees={attendees} forms={forms} isLoading={loading} onRefresh={refreshAttendees} />
              </>
            } />
            <Route path="/forms" element={<FormsManager />} />
            <Route path="/sponsors" element={<SponsorsDashboard />} />
            <Route path="/builder/:formId" element={<FormBuilder />} />
            <Route path="/generate-qr" element={
              <>
                <header className="mb-8 flex justify-between items-center bg-gradient-to-r from-violet-600 to-indigo-700 p-8 rounded-3xl shadow-2xl shadow-violet-600/20 text-white relative overflow-hidden border border-violet-500/30">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                  <div className="absolute -right-10 -top-20 opacity-20 transform rotate-12 scale-150 pointer-events-none">
                    <QrCode strokeWidth={1.5} className="w-64 h-64 text-white" />
                  </div>
                  <div className="relative z-10">
                    <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 border border-white/20 shadow-sm text-violet-50">
                      TICKET TOOLS
                    </div>
                    <h2 className="text-4xl font-extrabold text-white mb-2 drop-shadow-md tracking-tight">Manual Ticket Management</h2>
                    <p className="text-indigo-100 font-medium tracking-wide text-lg max-w-lg">
                      Generate QR codes for existing users and manage ticket delivery.
                    </p>
                  </div>
                </header>
                <ManualTicketTool />
              </>
            } />
            <Route path="/settings" element={<Settings />} />
            <Route path="/seating" element={<SeatingConfigurator />} />
          </Routes>
        </div>
      </main>

      {/* Scanner Modal */}
      {showScanner && (
        <Scanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
};

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireRole?: 'admin';
}

const ProtectedRoute = ({ children, requireRole }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate(CURRENT_SITE.portalEnabled ? '/' : '/login', { replace: true });
      return;
    }
    if (requireRole === 'admin' && profile !== null && profile.role !== 'admin') {
      navigate(CURRENT_SITE.portalEnabled ? '/portal' : '/', { replace: true });
    }
  }, [user, profile, loading, requireRole, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // Still fetching profile? Wait before evaluating role.
  if (user && profile === null && requireRole) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (requireRole === 'admin' && profile?.role !== 'admin') return null;

  return <>{children}</>;
};

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            {/* Login Route */}
            <Route path="/login" element={<Login />} />

            {/* Site-conditional root routes */}
            {CURRENT_SITE.portalEnabled ? (
              <>
                <Route path="/" element={<Landing />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                  path="/portal"
                  element={
                    <ProtectedRoute>
                      <PortalLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<PortalDashboard />} />
                  <Route path="profile" element={<ProfilePage />} />
                </Route>
              </>
            ) : (
              <Route path="/" element={<Navigate to="/admin" replace />} />
            )}

            {/* Public Form Route */}
            <Route path="/form/:formId" element={<PublicRegistration />} />

            {/* Admin Routes */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute requireRole="admin">
                  <AdminLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </NotificationProvider>
  );
}