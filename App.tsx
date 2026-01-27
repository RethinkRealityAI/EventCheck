import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, QrCode, ClipboardList, LogOut, Settings as SettingsIcon, ExternalLink, Menu, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import ManualTicketTool from './components/ManualTicketTool';
import AttendeeList from './components/AttendeeList';
import Scanner from './components/Scanner';
import FormsManager from './components/FormsManager';
import FormBuilder from './components/FormBuilder';
import Settings from './components/Settings';
import PublicRegistration from './components/PublicRegistration';
import { NotificationProvider } from './components/NotificationSystem';
import { Attendee } from './types';
import { getAttendees, checkInAttendee } from './services/storageService';
import { AuthProvider, useAuth } from './components/AuthContext';
import Login from './components/Login';

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
  const checkedIn = attendees.filter(a => a.checkedInAt).length;
  const percentage = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-gray-500 text-sm font-medium mb-2">Total Registrations</h3>
        <p className="text-4xl font-bold text-gray-900">{total}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-gray-500 text-sm font-medium mb-2">Live Attendance</h3>
        <div className="flex items-baseline gap-2">
          <p className="text-4xl font-bold text-indigo-600">{checkedIn}</p>
          <span className="text-sm text-gray-400">/ {total}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
          <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-gray-500 text-sm font-medium mb-2">Check-in Rate</h3>
        <p className="text-4xl font-bold text-gray-900">{percentage}%</p>
      </div>
    </div>
  );
};

const AdminLayout = () => {
  const { signOut } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
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
  useEffect(() => {
    const fetch = async () => {
      const data = await getAttendees();
      setAttendees(data);
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (data: string): Promise<Attendee | 'not_found' | 'already_checked_in'> => {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.id) return 'not_found';

      // Check if already checked in locally first for faster UI response
      const existingInState = attendees.find(a => a.id === parsed.id);
      if (existingInState?.checkedInAt) return 'already_checked_in';

      const attendee = await checkInAttendee(parsed.id);

      if (!attendee) return 'not_found';

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
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-gray-100 overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 w-full bg-gray-900 text-white z-20 flex justify-between items-center p-4">
        <div className="font-bold flex items-center gap-2"><QrCode className="w-6 h-6 text-indigo-500" /> EventCheck</div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <aside
        className={`
          fixed inset-y-0 left-0 z-10 flex flex-col transition-all duration-300 transform
          ${isMobileMenuOpen ? 'translate-x-0 pt-16 w-64' : '-translate-x-full lg:translate-x-0 lg:pt-0'}
          ${(isSidebarCollapsed && !isSidebarPinned) ? 'lg:w-20' : 'lg:w-72'}
          bg-slate-900/95 backdrop-blur-xl border-r border-slate-800 shadow-2xl
        `}
        onMouseEnter={() => !isSidebarPinned && setIsSidebarCollapsed(false)}
        onMouseLeave={() => !isSidebarPinned && setIsSidebarCollapsed(true)}
      >
        <div className={`p-6 flex items-center ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center transition-none' : 'justify-between'} transition-all duration-300`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30 flex-shrink-0">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div className={`transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
              <h1 className="text-xl font-bold text-white tracking-tight whitespace-nowrap">
                EventCheck
              </h1>
              <p className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Admin Console</p>
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
      <main className={`flex-1 overflow-y-auto pt-16 lg:pt-0 transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'lg:pl-20' : 'lg:pl-72'}`}>
        <div className="p-4 lg:p-6 w-full mx-auto">
          <Routes>
            <Route path="/" element={
              <>
                <header className="mb-8 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Event Dashboard</h2>
                    <p className="text-gray-500">Overview of all event activity.</p>
                  </div>
                </header>
                <DashboardStats attendees={attendees} />
                <AttendeeList attendees={attendees} />
              </>
            } />
            <Route path="/forms" element={<FormsManager />} />
            <Route path="/builder/:formId" element={<FormBuilder />} />
            <Route path="/generate-qr" element={
              <>
                <header className="mb-8">
                  <h2 className="text-2xl font-bold text-gray-900">Manual Ticket Management</h2>
                  <p className="text-gray-500">Generate QR codes for existing users and manage ticket delivery.</p>
                </header>
                <ManualTicketTool />
              </>
            } />
            <Route path="/settings" element={<Settings />} />
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

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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

            {/* Redirect Root to Admin */}
            <Route path="/" element={<Navigate to="/admin" replace />} />

            {/* Public Form Route */}
            <Route path="/form/:formId" element={<PublicRegistration />} />

            {/* Admin Routes */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute>
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