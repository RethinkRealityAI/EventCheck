import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { LayoutDashboard, QrCode, ClipboardList, LogOut, Settings as SettingsIcon, ExternalLink, Menu, X, ChevronLeft, ChevronRight, Loader2, Rows3, Users, Handshake, UserCircle, Shield, KeyRound, ScanLine } from 'lucide-react';
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
import { getAttendees, checkInAttendee, getForms, getAttendee, updateAttendee } from './services/storageService';
import { supabase } from './services/supabaseClient';
import { AuthProvider, useAuth } from './components/AuthContext';
import Login from './components/Login';
import { CURRENT_SITE } from './config/sites';
import { Landing } from './components/Portal/Landing/Landing';
import { PortalLayout } from './components/Portal/PortalLayout';
import { PortalDashboard } from './components/Portal/Dashboard/PortalDashboard';
import { ProfilePage } from './components/Portal/Profile/ProfilePage';
import { ResetPasswordPage } from './components/Portal/ResetPassword/ResetPasswordPage';
import AdminsManagement from './components/Admins/AdminsManagement';
import ChangePasswordPage from './components/ChangePasswordPage';
import {
  canAccessPage,
  canManageAdmins,
  firstAccessiblePage,
  isSuperAdmin,
  type AdminPageKey,
} from './utils/adminPermissions';

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
          <p className="text-4xl font-extrabold text-slate-800 drop-shadow-sm">{primaryAttendees.length + guestCount}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-1 rounded-md">{primaryAttendees.length} registrant{primaryAttendees.length !== 1 ? 's' : ''}</span>
            {guestCount > 0 && <span className="text-xs text-indigo-400 font-semibold bg-indigo-50 px-2 py-1 rounded-md">{guestCount} guest{guestCount !== 1 ? 's' : ''}</span>}
          </div>
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
  const { signOut, profile } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const navigate = useNavigate();

  // Per-page access flags for sidebar rendering.
  const canSeeDashboard = canAccessPage(profile, 'dashboard');
  const canSeeForms = canAccessPage(profile, 'forms');
  const canSeeSponsors = canAccessPage(profile, 'sponsors');
  const canSeeSeating = canAccessPage(profile, 'seating');
  const canSeeGenerateQr = canAccessPage(profile, 'generateQr');
  const canSeeSettings = canAccessPage(profile, 'settings');
  const canSeeAdmins = canManageAdmins(profile);

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
    // Polling kept as a safety net at a slower cadence (15s) so transient
    // realtime disconnects don't leave the dashboard frozen. The realtime
    // channel below is what drives sub-second updates at the door.
    const interval = setInterval(refreshAttendees, 15000);
    return () => clearInterval(interval);
  }, [refreshAttendees]);

  // Live attendee updates via Supabase Postgres-changes subscription.
  // Triggered by every INSERT (new registration) and UPDATE (check-in stamp,
  // table assignment, etc.) on `public.attendees`. The migration
  // `20260513170000_enable_realtime_attendees.sql` adds the table to the
  // `supabase_realtime` publication on both projects. We re-fetch the full
  // row by id rather than rely on the WAL payload because the row is small
  // and a fresh fetch keeps us aligned with the same shape `getAttendee`
  // returns elsewhere (joined fields, derived columns).
  useEffect(() => {
    const channel = supabase
      .channel('attendees-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendees' },
        async (payload) => {
          const rowId = (payload.new as any)?.id ?? (payload.old as any)?.id;
          if (!rowId) return;
          if (payload.eventType === 'DELETE') {
            setAttendees(prev => prev.filter(a => a.id !== rowId));
            return;
          }
          const fresh = await getAttendee(rowId);
          if (!fresh) return;
          setAttendees(prev => {
            const idx = prev.findIndex(a => a.id === fresh.id);
            if (idx === -1) return [fresh, ...prev];
            const next = prev.slice();
            next[idx] = fresh;
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Scan outcomes:
  //   - `not_found`        : QR didn't match any attendee
  //   - `already_checked_in`: attendee was previously checked in
  //   - { pendingCapture }  : attendee row exists but it's a placeholder
  //                           guest who hasn't filled in their own details
  //                           yet (a "Guest Ticket #N" row from a table
  //                           purchase). The Scanner UI surfaces inline
  //                           inputs so door staff can capture name + email
  //                           and check the person in atomically.
  //   - Attendee            : normal scan, attendee now checked in
  // Ref mirror of `attendees` so `handleScan` can read the latest list
  // without listing `attendees` as a useCallback dep. If we did, the
  // callback's identity would change every time the realtime subscription
  // updated the array, the Scanner's `onScan` prop would change, the
  // Scanner's camera-startup effect would re-fire, and `video.play()`
  // would reject (no fresh user gesture) → "Tap the screen to start the
  // camera" appearing mid-scan-session.
  const attendeesRef = useRef<Attendee[]>(attendees);
  useEffect(() => { attendeesRef.current = attendees; }, [attendees]);

  const handleScan = useCallback(async (data: string): Promise<Attendee | 'not_found' | 'already_checked_in' | { pendingCapture: true; attendee: Attendee }> => {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.id) return 'not_found';

      // Local fast-path for already-checked-in scans.
      const existingInState = attendeesRef.current.find(a => a.id === parsed.id);
      if (existingInState?.checkedInAt) return 'already_checked_in';

      // Peek at the attendee first so we can decide whether this is a
      // placeholder that needs name+email capture before we check them in.
      // Skipping the auto-check-in for placeholders keeps the dashboard
      // honest: a row only flips to "Checked In" once we have a real name
      // attached to it, not just because someone scanned a generic ticket.
      const peek = await getAttendee(parsed.id);
      if (!peek) return 'not_found';
      if (peek.checkedInAt) return 'already_checked_in';

      const isPlaceholder = peek.guestType === 'pending-claim'
        || peek.guestType === 'staff-pending'
        || peek.guestType === 'exhibitor-staff-pending';
      if (isPlaceholder) {
        return { pendingCapture: true, attendee: peek };
      }

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
      // Surface the actual failure in DevTools — without this, every cause
      // (malformed QR, RPC error, network blip) collapses to "Invalid Ticket"
      // at the door and there's no way to tell them apart.
      console.warn('Scanner: failed to resolve QR payload', { data, error: e });
      return 'not_found';
    }
  }, []);

  // Called by the Scanner after door staff fills in a placeholder guest's
  // name + email at scan time. Saves the captured details, transitions the
  // guest out of placeholder state (`pending-claim` → `claimed`), and
  // stamps `checkedInAt` so the check-in completes in one round-trip. The
  // Scanner uses the returned attendee to render the success card. Memoized
  // for the same reason as `handleScan` above — keeps Scanner's prop
  // identity stable so the camera doesn't restart on parent re-renders.
  const handleCapturePlaceholder = useCallback(async (
    attendeeId: string,
    name: string,
    email: string,
  ): Promise<Attendee | null> => {
    const now = new Date().toISOString();
    // Existing guestType drives the post-claim state so staff-pending
    // becomes staff-claimed (not the generic `claimed`), matching how the
    // public claim flow handles the same transition.
    const current = await getAttendee(attendeeId);
    if (!current) return null;
    let claimedType: Attendee['guestType'] = 'claimed';
    if (current.guestType === 'staff-pending') claimedType = 'staff-claimed';
    else if (current.guestType === 'exhibitor-staff-pending') claimedType = 'exhibitor-staff-claimed';
    const updates: Partial<Attendee> = {
      name: name.trim(),
      email: email.trim(),
      guestType: claimedType,
      checkedInAt: now,
    };
    try {
      await updateAttendee(attendeeId, updates);
    } catch (err) {
      console.error('Failed to capture placeholder guest details', err);
      return null;
    }
    const updated = { ...current, ...updates };
    setAttendees(prev => {
      const idx = prev.findIndex(a => a.id === updated.id);
      if (idx !== -1) return prev.map(a => a.id === updated.id ? updated : a);
      return [updated, ...prev];
    });
    return updated;
  }, []);

  return (
    <div className="flex h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50/80 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-blue-100/40 rounded-full blur-[120px] pointer-events-none transform translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-indigo-100/40 rounded-full blur-[120px] pointer-events-none transform -translate-x-1/3 translate-y-1/3"></div>
      {/* Mobile Floating Bottom Nav */}
      <div className="lg:hidden fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center w-[calc(100vw-1.5rem)] max-w-md">
        {isMobileMenuOpen && (
          <div className="bg-slate-900/80 backdrop-blur-2xl p-2 rounded-2xl shadow-2xl shadow-indigo-900/20 border border-slate-700/50 flex flex-wrap items-center justify-center gap-1.5 mb-4 animate-in slide-in-from-bottom-4 zoom-in-95 duration-200 w-full">
            {canSeeDashboard && (
              <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
                <LayoutDashboard className="w-6 h-6" />
              </Link>
            )}
            {canSeeForms && (
              <Link to="/admin/forms" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
                <ClipboardList className="w-6 h-6" />
              </Link>
            )}
            {canSeeSeating && (
              <Link to="/admin/seating" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
                <Rows3 className="w-6 h-6" />
              </Link>
            )}
            {canSeeSponsors && (
              <Link to="/admin/sponsors" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
                <Handshake className="w-6 h-6" />
              </Link>
            )}
            <button
              onClick={() => { setShowScanner(true); setIsMobileMenuOpen(false); }}
              title="Scan tickets"
              className={`p-3 rounded-xl transition-all ${showScanner
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <ScanLine className="w-6 h-6" />
            </button>
            {canSeeSettings && (
              <Link to="/admin/settings" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all">
                <SettingsIcon className="w-6 h-6" />
              </Link>
            )}
            {canSeeAdmins && (
              <Link to="/admin/admins" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-amber-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all" title="Admin Management">
                <Shield className="w-6 h-6" />
              </Link>
            )}
            {CURRENT_SITE.portalEnabled && (
              <Link to="/portal" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all" title="User Portal">
                <UserCircle className="w-6 h-6" />
              </Link>
            )}
            <Link to="/change-password" onClick={() => setIsMobileMenuOpen(false)} className="p-3 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-xl transition-all" title="Change password">
              <KeyRound className="w-6 h-6" />
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
          {canSeeDashboard && <NavLink to="/admin" icon={LayoutDashboard} collapsed={isSidebarCollapsed && !isSidebarPinned}>Dashboard</NavLink>}
          {canSeeForms && <NavLink to="/admin/forms" icon={ClipboardList} collapsed={isSidebarCollapsed && !isSidebarPinned}>Manage Forms</NavLink>}
          {canSeeSponsors && <NavLink to="/admin/sponsors" icon={Handshake} collapsed={isSidebarCollapsed && !isSidebarPinned}>Sponsors</NavLink>}
          {canSeeSeating && <NavLink to="/admin/seating" icon={Rows3} collapsed={isSidebarCollapsed && !isSidebarPinned}>Seating Chart</NavLink>}
          {canSeeGenerateQr && <NavLink to="/admin/generate-qr" icon={QrCode} collapsed={isSidebarCollapsed && !isSidebarPinned}>Generate QR</NavLink>}
          {canSeeSettings && <NavLink to="/admin/settings" icon={SettingsIcon} collapsed={isSidebarCollapsed && !isSidebarPinned}>Settings</NavLink>}

          {canSeeAdmins && (
            <div className="pt-3 mt-3 border-t border-slate-700/50 mx-2">
              <Link
                to="/admin/admins"
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group text-amber-300 hover:bg-slate-800 hover:text-amber-200 ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center' : ''}`}
                title="Admin Management"
              >
                <Shield className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span className={`font-medium whitespace-nowrap transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Admins</span>
              </Link>
            </div>
          )}

          <div className="pt-4 mt-4 border-t border-slate-700/50 mx-2 space-y-2">
            {CURRENT_SITE.portalEnabled && (
              <Link
                to="/portal"
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group text-slate-400 hover:bg-slate-800 hover:text-white ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center' : ''}`}
                title="User Portal"
              >
                <UserCircle className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span className={`font-medium whitespace-nowrap transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>User Portal</span>
              </Link>
            )}
            <Link
              to="/change-password"
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group text-slate-400 hover:bg-slate-800 hover:text-white ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center' : ''}`}
              title="Change password"
            >
              <KeyRound className="w-5 h-5 transition-transform group-hover:scale-110" />
              <span className={`font-medium whitespace-nowrap transition-all duration-300 ${(isSidebarCollapsed && !isSidebarPinned) ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>Change Password</span>
            </Link>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-700/50 mx-2">
            <button
              onClick={() => { setShowScanner(true); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all group ${(isSidebarCollapsed && !isSidebarPinned) ? 'justify-center bg-indigo-500/10 text-indigo-400' : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-900/20'
                }`}
              title="Scan Tickets"
            >
              <ScanLine className={`w-5 h-5 transition-transform group-hover:scale-110 ${(isSidebarCollapsed && !isSidebarPinned) ? '' : 'text-white'}`} />
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
              <ProtectedRoute requirePage="dashboard">
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
              </ProtectedRoute>
            } />
            <Route path="/forms" element={<ProtectedRoute requirePage="forms"><FormsManager /></ProtectedRoute>} />
            <Route path="/sponsors" element={<ProtectedRoute requirePage="sponsors"><SponsorsDashboard /></ProtectedRoute>} />
            <Route path="/builder/:formId" element={<ProtectedRoute requirePage="forms"><FormBuilder /></ProtectedRoute>} />
            <Route path="/generate-qr" element={
              <ProtectedRoute requirePage="generateQr">
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
              </ProtectedRoute>
            } />
            <Route path="/settings" element={<ProtectedRoute requirePage="settings"><Settings /></ProtectedRoute>} />
            <Route path="/seating" element={<ProtectedRoute requirePage="seating"><SeatingConfigurator /></ProtectedRoute>} />
            <Route path="/admins" element={<ProtectedRoute requireSuperAdmin><AdminsManagement /></ProtectedRoute>} />
          </Routes>
        </div>
      </main>

      {/* Scanner Modal */}
      {showScanner && (
        <Scanner
          onScan={handleScan}
          onCapturePlaceholder={handleCapturePlaceholder}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
};

interface ProtectedRouteProps {
  children: React.ReactElement;
  requireRole?: 'admin';
  /** If set, only super_admins may render the children. */
  requireSuperAdmin?: boolean;
  /** If set, the caller must have permission to access this admin page. */
  requirePage?: AdminPageKey;
}

const ProtectedRoute = ({ children, requireRole, requireSuperAdmin, requirePage }: ProtectedRouteProps) => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Admin routes always fall back to /login — portal-enabled sites too.
      // Routing unsigned-in admins through Landing/AuthPanel is convoluted:
      // it defaults to the signup tab (attendee role), so existing admins
      // would bounce through /portal before reaching the dashboard.
      navigate(requireRole === 'admin' ? '/login' : (CURRENT_SITE.portalEnabled ? '/' : '/login'), { replace: true });
      return;
    }
    // Admin role gate: admin AND super_admin both qualify.
    if (requireRole === 'admin' && profile !== null && profile.role !== 'admin' && profile.role !== 'super_admin') {
      navigate(CURRENT_SITE.portalEnabled ? '/portal' : '/', { replace: true });
      return;
    }
    // Super-admin-only pages (admin management).
    if (requireSuperAdmin && profile !== null && profile.role !== 'super_admin') {
      // Kick back to an accessible admin page, or portal/home if none.
      const fallback = firstAccessiblePage(profile);
      navigate(fallback ? (fallback === 'dashboard' ? '/admin' : `/admin/${fallback === 'generateQr' ? 'generate-qr' : fallback}`) : (CURRENT_SITE.portalEnabled ? '/portal' : '/'), { replace: true });
      return;
    }
    // Per-page permission gate (admin only — super_admin bypasses via canAccessPage).
    if (requirePage && profile !== null && !canAccessPage(profile, requirePage)) {
      const fallback = firstAccessiblePage(profile);
      navigate(fallback ? (fallback === 'dashboard' ? '/admin' : `/admin/${fallback === 'generateQr' ? 'generate-qr' : fallback}`) : (CURRENT_SITE.portalEnabled ? '/portal' : '/'), { replace: true });
    }
  }, [user, profile, loading, requireRole, requireSuperAdmin, requirePage, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // Still fetching profile? Wait before evaluating role.
  if (user && profile === null && (requireRole || requireSuperAdmin || requirePage)) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (requireRole === 'admin' && profile?.role !== 'admin' && profile?.role !== 'super_admin') return null;
  if (requireSuperAdmin && !isSuperAdmin(profile)) return null;
  if (requirePage && !canAccessPage(profile, requirePage)) return null;

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

            {/* Change password — any signed-in user can reach this. Primarily
                used by SCAGO admins (no portal surface) + as a fallback link
                anywhere we don't want to depend on portalEnabled. */}
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePasswordPage />
                </ProtectedRoute>
              }
            />

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