import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, QrCode, ClipboardList, LogOut, Settings as SettingsIcon, ExternalLink, Menu, X } from 'lucide-react';
import ManualTicketTool from './components/ManualTicketTool';
import AttendeeList from './components/AttendeeList';
import Scanner from './components/Scanner';
import FormsManager from './components/FormsManager';
import FormBuilder from './components/FormBuilder';
import Settings from './components/Settings';
import PublicRegistration from './components/PublicRegistration';
import { Attendee } from './types';
import { getAttendees, checkInAttendee } from './services/storageService';

const NavLink = ({ to, icon: Icon, children }: { to: string, icon: any, children?: React.ReactNode }) => {
  const location = useLocation();
  const isActive = location.pathname.startsWith(to) && (to !== '/admin' || location.pathname === '/admin');
  
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        isActive 
          ? 'bg-indigo-600 text-white shadow-md' 
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{children}</span>
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
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Refresh data whenever route might have changed data or periodically
  useEffect(() => {
    setAttendees(getAttendees());
    const interval = setInterval(() => setAttendees(getAttendees()), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = (data: string): Attendee | 'not_found' | 'already_checked_in' => {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.id) return 'not_found';
      
      const attendee = checkInAttendee(parsed.id);
      
      if (!attendee) return 'not_found';
      
      const previousState = attendees.find(a => a.id === parsed.id);
      if (previousState && previousState.checkedInAt) {
        return 'already_checked_in';
      }

      setAttendees(prev => prev.map(a => a.id === attendee.id ? attendee : a));
      return attendee;

    } catch (e) {
      return 'not_found';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 w-full bg-gray-900 text-white z-20 flex justify-between items-center p-4">
         <div className="font-bold flex items-center gap-2"><QrCode className="w-6 h-6 text-indigo-500" /> EventCheck</div>
         <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
           {isMobileMenuOpen ? <X /> : <Menu />}
         </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-10 w-64 bg-gray-900 flex flex-col transition-transform duration-300 transform lg:translate-x-0 lg:static lg:flex-shrink-0
        ${isMobileMenuOpen ? 'translate-x-0 pt-16' : '-translate-x-full lg:pt-0'}
      `}>
        <div className="p-6 hidden lg:block">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <QrCode className="w-8 h-8 text-indigo-500" />
            EventCheck
          </h1>
          <p className="text-gray-500 text-xs mt-2">Admin Console</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4 lg:mt-0">
          <NavLink to="/admin" icon={LayoutDashboard}>Dashboard</NavLink>
          <NavLink to="/admin/forms" icon={ClipboardList}>Manage Forms</NavLink>
          <NavLink to="/admin/generate-qr" icon={QrCode}>Generate QR</NavLink>
          <NavLink to="/admin/settings" icon={SettingsIcon}>Settings</NavLink>
          
          <div className="pt-2 mt-4 border-t border-gray-800">
            <button 
              onClick={() => { setShowScanner(true); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-indigo-400 hover:bg-gray-800 hover:text-indigo-300 transition-colors"
            >
              <QrCode className="w-5 h-5" />
              <span className="font-medium">Scan Tickets</span>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white cursor-pointer transition-colors">
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
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

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Redirect Root to Admin */}
        <Route path="/" element={<Navigate to="/admin" replace />} />

        {/* Public Form Route */}
        <Route path="/form/:formId" element={<PublicRegistration />} />
        
        {/* Admin Routes */}
        <Route path="/admin/*" element={<AdminLayout />} />
      </Routes>
    </HashRouter>
  );
}