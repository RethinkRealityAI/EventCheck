import React, { useState } from 'react';
import { Attendee } from '../types';
import { LayoutDashboard, Users, ChevronDown, ChevronRight, UserPlus, CheckCircle, Clock, Search, Calendar, Eye, X, Mail, Tag, User, Download, FileSpreadsheet, Settings as SettingsIcon, Check, MoreVertical, Trash2, Edit3, ChevronLeft, Filter, AlertCircle, Loader2, Copy, ChevronsDown, ChevronsRight } from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'react-qr-code';
import { updateAttendee, deleteAttendee, getSettings } from '../services/storageService';
import { useNotifications } from './NotificationSystem';
import { sendEmail } from '../services/emailService';
import { generateEmailHtml } from '../utils/emailTemplates';

interface AttendeeListProps {
  attendees: Attendee[];
  isLoading?: boolean;
}

const AttendeeList: React.FC<AttendeeListProps> = ({ attendees, isLoading = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'test' | 'donated' | 'tables'>('live');
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const [resending, setResending] = useState(false);
  const { showNotification } = useNotifications();
  const [showExportModal, setShowExportModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Attendee>>({});

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Collapsed state for tables
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  const toggleTable = (id: string) => {
    setExpandedTables(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Advanced Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked-in' | 'pending'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'free' | 'pending'>('all');

  const [exportFields, setExportFields] = useState<Record<string, boolean>>({
    id: true,
    name: true,
    email: true,
    ticketType: true,
    registeredAt: true,
    checkedInAt: true,
    paymentStatus: true,
    invoiceId: true,
    transactionId: true,
    paymentAmount: true,
    formTitle: true,
    donatedSeats: true,
    donatedTables: true,
    donationType: true,
    dietaryPreferences: true,
    isPrimary: true
  });

  const fieldLabels: Record<string, string> = {
    id: 'Registration ID',
    name: 'Full Name',
    email: 'Email Address',
    ticketType: 'Ticket Type',
    registeredAt: 'Registered Date',
    checkedInAt: 'Check-in Time',
    paymentStatus: 'Payment Status',
    invoiceId: 'Invoice ID',
    transactionId: 'PayPal Transaction ID',
    paymentAmount: 'Amount Paid',
    formTitle: 'Event Title',
    donatedSeats: 'Donated Seats',
    donatedTables: 'Donated Tables',
    donationType: 'Donation Type',
    dietaryPreferences: 'Dietary Preferences',
    isPrimary: 'Primary / Guest'
  };

  // Filter logic
  const filtered = attendees.filter(a => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.id.toLowerCase().includes(searchTerm.toLowerCase());

    const isTest = !!a.isTest;
    let matchesTab = false;
    if (activeTab === 'test') matchesTab = isTest;
    else if (activeTab === 'donated') matchesTab = !isTest && ((a.donatedSeats || 0) > 0 || (a.donatedTables || 0) > 0);
    else matchesTab = !isTest;

    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'checked-in' ? !!a.checkedInAt : !a.checkedInAt;

    const matchesPayment = paymentFilter === 'all'
      ? true
      : a.paymentStatus === paymentFilter;

    return matchesSearch && matchesTab && matchesStatus && matchesPayment;
  });

  // Count donated seats for badge
  const totalDonatedCount = attendees.filter(a => !a.isTest && ((a.donatedSeats || 0) > 0 || (a.donatedTables || 0) > 0)).length;

  // Pagination Logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(startIndex, startIndex + itemsPerPage);

  // Grouping Logic for "Tables" view
  const groupedByTable = React.useMemo(() => {
    // Only group live (non-test) attendees for tables view
    const liveAttendees = attendees.filter(a => !a.isTest);
    const tables: Record<string, { primary: Attendee, guests: Attendee[] }> = {};

    // First pass: find all primaries
    liveAttendees.forEach(a => {
      if (a.isPrimary !== false) {
        tables[a.id] = { primary: a, guests: [] };
      }
    });

    // Second pass: associate guests
    liveAttendees.forEach(a => {
      if (a.isPrimary === false && a.primaryAttendeeId && tables[a.primaryAttendeeId]) {
        tables[a.primaryAttendeeId].guests.push(a);
      }
    });

    // Filter by search if active
    let result = Object.values(tables);
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.primary.name.toLowerCase().includes(lowerSearch) ||
        t.primary.email.toLowerCase().includes(lowerSearch) ||
        t.guests.some(g => (g.name || '').toLowerCase().includes(lowerSearch) || (g.email || '').toLowerCase().includes(lowerSearch))
      );
    }

    return result.sort((a, b) => b.primary.registeredAt.localeCompare(a.primary.registeredAt));
  }, [attendees, searchTerm]);

  // Pagination for Tables
  const totalTablePages = Math.ceil(groupedByTable.length / itemsPerPage);
  const paginatedTables = groupedByTable.slice(startIndex, startIndex + itemsPerPage);

  const handleResendEmail = async () => {
    if (!selectedAttendee) return;
    setResending(true);
    try {
      const settings = await getSettings();
      const html = generateEmailHtml(settings, settings.emailBodyTemplate, selectedAttendee);
      await sendEmail(selectedAttendee.email, settings.emailSubject, html);
      showNotification(`Ticket resent to ${selectedAttendee.email}`, 'success');
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to resend email: ${err.message}`, 'error');
    } finally {
      setResending(false);
    }
  };

  const handleUpdateAttendee = async (id: string, updates: Partial<Attendee>) => {
    await updateAttendee(id, updates);
    setIsEditing(false);
    setSelectedAttendee(null);
  };

  const handleDeleteAttendee = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this registration? This cannot be undone.")) {
      await deleteAttendee(id);
      setSelectedAttendee(null);
      showNotification('Registration deleted', 'info');
    }
  };

  const handleExpandAll = () => {
    const allIds: Record<string, boolean> = {};
    paginatedTables.forEach(t => allIds[t.primary.id] = true);
    setExpandedTables(prev => ({ ...prev, ...allIds }));
  };

  const handleCollapseAll = () => {
    setExpandedTables({});
  };

  const handleCopyGuestLink = (e: React.MouseEvent, formId: string, primaryId: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/register/${formId}?guestRef=${primaryId}`;
    navigator.clipboard.writeText(url);
    showNotification("Guest registration link copied to clipboard!", 'success');
  };

  const toggleField = (field: string) => {
    setExportFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleExportCSV = () => {
    const selectedKeys = Object.entries(exportFields)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    if (selectedKeys.length === 0) {
      showNotification("Please select at least one field to export.", 'warning');
      return;
    }

    // Header row
    const headers = selectedKeys.map(key => fieldLabels[key] || key).join(',');

    // Data rows
    const rows = filtered.map(attendee => {
      return selectedKeys.map(key => {
        let val = (attendee as any)[key];
        if (val && (key === 'registeredAt' || key === 'checkedInAt')) {
          val = format(new Date(val), 'yyyy-MM-dd HH:mm:ss');
        }
        if (val === undefined || val === null) val = '';
        const strVal = String(val).replace(/"/g, '""');
        return `"${strVal}"`;
      }).join(',');
    });

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `attendees_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
      {/* Header & Tabs */}
      <div className="p-4 border-b border-gray-100 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-lg text-gray-900">Registered Attendees</h2>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
              <button
                onClick={() => { setActiveTab('live'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${activeTab === 'live' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Live
              </button>
              <button
                onClick={() => { setActiveTab('test'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${activeTab === 'test' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Test
              </button>
              <button
                onClick={() => { setActiveTab('donated'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${activeTab === 'donated' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                🪑 Donated
                {totalDonatedCount > 0 && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalDonatedCount}</span>}
              </button>
              <button
                onClick={() => { setActiveTab('tables'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${activeTab === 'tables' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <LayoutDashboard className="w-3 h-3" /> Tables
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <select
              value={itemsPerPage}
              onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
              title="Export as CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        {activeTab === 'tables' ? (
          <div className="flex flex-wrap items-center gap-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
            <button
              onClick={handleExpandAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition shadow-sm"
            >
              <ChevronsDown className="w-4 h-4" /> Expand All
            </button>
            <button
              onClick={handleCollapseAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition shadow-sm"
            >
              <ChevronsRight className="w-4 h-4" /> Collapse All
            </button>
            <div className="h-6 w-px bg-slate-200 mx-2"></div>
            <span className="text-slate-400 text-xs font-medium">
              Showing {paginatedTables.length} table{paginatedTables.length !== 1 ? 's' : ''} on this page
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Attendance:</span>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="checked-in">Checked In</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Payment:</span>
              <select
                value={paymentFilter}
                onChange={e => { setPaymentFilter(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">All Payments</option>
                <option value="paid">Paid Only</option>
                <option value="free">Free Only</option>
                <option value="pending">Pending Payments</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto flex-1 custom-scrollbar">
        {activeTab === 'tables' ? (
          <div className="divide-y divide-gray-100">
            {isLoading ? (
              <div className="p-12 text-center text-gray-400">
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-indigo-500" />
                <p>Loading table view...</p>
              </div>
            ) : paginatedTables.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                <p>No tables found matching your search.</p>
              </div>
            ) : (
              paginatedTables.map(({ primary, guests }) => (
                <div key={primary.id} className="bg-white group transition-all">
                  <div
                    onClick={() => toggleTable(primary.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <LayoutDashboard className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 flex items-center gap-2">
                          Table: {primary.name}
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            {guests.length + 1} Seat{(guests.length + 1) !== 1 ? 's' : ''}
                          </span>
                        </h4>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {primary.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="hidden sm:flex flex-col items-end">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Status</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${primary.checkedInAt ? 'bg-green-500' : 'bg-amber-400'}`}></div>
                          <span className="text-xs font-bold text-gray-700">
                            {guests.filter(g => g.checkedInAt).length + (primary.checkedInAt ? 1 : 0)} / {guests.length + 1} Checked In
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleCopyGuestLink(e, primary.formId, primary.id)}
                        className="p-2 text-gray-400 hover:text-indigo-600 transition-colors hidden sm:block"
                        title="Copy Guest Invite Link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-indigo-600 transition-colors">
                        {expandedTables[primary.id] ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {expandedTables[primary.id] && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden shadow-inner">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Attendee</th>
                              <th className="px-4 py-3">Role</th>
                              <th className="px-4 py-3">Ticket Type</th>
                              <th className="px-4 py-3 text-center">Status</th>
                              <th className="px-4 py-3 text-right pr-6">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {/* Primary Purchaser */}
                            <tr className="bg-white/50 hover:bg-white transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-bold text-gray-900">{primary.name}</div>
                                <div className="text-gray-400">{primary.email}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-indigo-100 text-indigo-700 border border-indigo-200">Purchaser</span>
                              </td>
                              <td className="px-4 py-3 text-gray-500">{primary.ticketType}</td>
                              <td className="px-4 py-3 text-center">
                                {primary.checkedInAt ? (
                                  <Check className="w-4 h-4 text-green-500 mx-auto" strokeWidth={3} />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                                )}
                              </td>
                              <td className="px-4 py-3 text-right pr-6">
                                <button onClick={() => setSelectedAttendee(primary)} className="text-indigo-600 hover:underline font-bold">View</button>
                              </td>
                            </tr>
                            {/* Guests */}
                            {guests.map((g, idx) => (
                              <tr key={g.id} className="bg-white/30 hover:bg-white transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-bold text-gray-900">{g.name || `Guest #${idx + 1}`}</div>
                                  <div className="text-gray-400">{g.email || 'No email provided'}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-purple-100 text-purple-700 border border-purple-200">Guest</span>
                                </td>
                                <td className="px-4 py-3 text-gray-500 italic">{g.ticketType}</td>
                                <td className="px-4 py-3 text-center">
                                  {g.checkedInAt ? (
                                    <Check className="w-4 h-4 text-green-500 mx-auto" strokeWidth={3} />
                                  ) : (
                                    <Clock className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right pr-6">
                                  <button onClick={() => setSelectedAttendee(g)} className="text-indigo-600 hover:underline font-bold">View</button>
                                </td>
                              </tr>
                            ))}
                            {guests.length === 0 && (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic bg-white/20">
                                  <div className="flex flex-col items-center gap-1">
                                    <UserPlus className="w-5 h-5 opacity-20" />
                                    <span>No guests registered yet via sharing link.</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-900 font-medium">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Event/Form</th>
                <th className="px-6 py-3">Ticket Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Registered</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                      <p className="text-sm font-medium">Loading attendees...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <User className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p>No attendees match your filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((attendee) => (
                  <tr key={attendee.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-900">{attendee.name}</div>
                        {attendee.isPrimary === false && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">GUEST</span>
                        )}
                        {((attendee.donatedSeats || 0) > 0 || (attendee.donatedTables || 0) > 0) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            {attendee.donationType === 'table' && (attendee.donatedTables || 0) > 0
                              ? `🪑 ${attendee.donatedTables} tbl (${attendee.donatedSeats})`
                              : `🪑 ${attendee.donatedSeats}`
                            }
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-xs">{attendee.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <Calendar className="w-3 h-3 text-indigo-500" />
                        <span className="truncate max-w-[150px] block" title={attendee.formTitle}>
                          {attendee.formTitle || 'Unknown Event'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                        {attendee.ticketType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {attendee.checkedInAt ? (
                        <span className="flex items-center gap-1.5 text-green-600 font-medium">
                          <CheckCircle className="w-4 h-4" /> Checked In
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <Clock className="w-4 h-4" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                      {format(new Date(attendee.registeredAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedAttendee(attendee)}
                        className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 p-2 rounded-lg transition"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {activeTab === 'tables' ? (
            <>Showing {groupedByTable.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, groupedByTable.length)} of {groupedByTable.length} tables</>
          ) : (
            <>Showing {filtered.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filtered.length)} of {filtered.length} records</>
          )}
        </div>

        {((activeTab === 'tables' ? totalTablePages : totalPages) > 1) && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded bg-white border border-gray-200 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-medium text-gray-700">Page {currentPage} of {activeTab === 'tables' ? totalTablePages : totalPages}</span>
            <button
              onClick={() => setCurrentPage(prev => Math.min((activeTab === 'tables' ? totalTablePages : totalPages), prev + 1))}
              disabled={currentPage === (activeTab === 'tables' ? totalTablePages : totalPages)}
              className="p-1 rounded bg-white border border-gray-200 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedAttendee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {selectedAttendee.name}
                    {selectedAttendee.isTest && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium border border-orange-200">TEST</span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-500 font-medium">{selectedAttendee.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditData(selectedAttendee);
                    setIsEditing(true);
                  }}
                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                  title="Edit Attendee"
                >
                  <Edit3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleDeleteAttendee(selectedAttendee.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Delete Attendee"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { setSelectedAttendee(null); setIsEditing(false); }}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isEditing ? (
                <div className="space-y-6 animate-fade-in-up">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Full Name</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={editData.name || ''}
                        onChange={e => setEditData({ ...editData, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Email Address</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={editData.email || ''}
                        onChange={e => setEditData({ ...editData, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Ticket Type</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={editData.ticketType || ''}
                        onChange={e => setEditData({ ...editData, ticketType: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-400 uppercase">Payment Status</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        value={editData.paymentStatus || ''}
                        onChange={e => setEditData({ ...editData, paymentStatus: e.target.value as any })}
                      >
                        <option value="free">Free</option>
                        <option value="paid">Paid</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      id="checkInStatus"
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                      checked={!!editData.checkedInAt}
                      onChange={e => setEditData({ ...editData, checkedInAt: e.target.checked ? new Date().toISOString() : null })}
                    />
                    <label htmlFor="checkInStatus" className="text-gray-700 font-medium">Mark as Checked In</label>
                  </div>
                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 py-2.5 border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdateAttendee(selectedAttendee.id, editData)}
                      className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-900/20"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="flex flex-col items-center space-y-6">
                    <div className="bg-white p-4 border border-gray-200 rounded-2xl shadow-sm">
                      <QRCode value={selectedAttendee.qrPayload} size={180} />
                    </div>
                    <div className="w-full space-y-3">
                      <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-sm">
                        <span className="text-slate-500 font-medium">Status</span>
                        {selectedAttendee.checkedInAt ? (
                          <span className="text-green-600 font-bold flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3.5 h-3.5" /> Checked In
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium bg-slate-200 px-2 py-0.5 rounded-full">Not Checked In</span>
                        )}
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl flex justify-between items-center text-sm">
                        <span className="text-slate-500 font-medium">Payment</span>
                        <span className={`font-bold capitalize px-2 py-0.5 rounded-full flex items-center gap-1.5 ${selectedAttendee.paymentStatus === 'paid' ? 'bg-green-50 text-green-600' : 'bg-slate-200 text-slate-700'
                          }`}>
                          {selectedAttendee.paymentStatus || 'Free'}
                        </span>
                      </div>
                      <button
                        onClick={handleResendEmail}
                        disabled={resending}
                        className="w-full py-3 bg-white border border-indigo-200 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition flex items-center justify-center gap-2"
                      >
                        <Mail className="w-4 h-4" /> {resending ? 'Sending...' : 'Resend Ticket Email'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-4">Registration Details</h4>
                      <div className="space-y-4">
                        <div className="group">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Registration ID</label>
                          <div className="text-xs font-mono bg-slate-100 px-3 py-2 rounded-lg text-slate-600 select-all border border-slate-200">
                            {selectedAttendee.id}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Ticket Type</label>
                          <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div> {selectedAttendee.ticketType}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Event Name</label>
                          <div className="text-sm font-medium text-slate-700">{selectedAttendee.formTitle}</div>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Registered</label>
                            <div className="text-xs text-slate-900 font-medium">{format(new Date(selectedAttendee.registeredAt), 'PPP')}</div>
                          </div>
                          {selectedAttendee.checkedInAt && (
                            <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Checked In</label>
                              <div className="text-xs text-green-600 font-bold">{format(new Date(selectedAttendee.checkedInAt), 'p')}</div>
                            </div>
                          )}
                        </div>
                        {(selectedAttendee.invoiceId || selectedAttendee.transactionId) && (
                          <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
                            {selectedAttendee.invoiceId && (
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Invoice ID</label>
                                <div className="text-xs font-medium text-slate-700">{selectedAttendee.invoiceId}</div>
                              </div>
                            )}
                            {selectedAttendee.transactionId && (
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 text-blue-600">PayPal Transaction</label>
                                <div className="text-xs font-mono font-medium text-blue-700 select-all">{selectedAttendee.transactionId}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Donated Seats/Tables Info */}
                        {((selectedAttendee.donatedSeats && selectedAttendee.donatedSeats > 0) || (selectedAttendee.donatedTables && selectedAttendee.donatedTables > 0)) && (
                          <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
                            <div>
                              <label className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">
                                {selectedAttendee.donationType === 'table' ? 'Donated Tables' : 'Donated Seats'}
                              </label>
                              <div className="text-sm font-bold text-emerald-700">
                                {selectedAttendee.donationType === 'table' && (selectedAttendee.donatedTables || 0) > 0
                                  ? `${selectedAttendee.donatedTables} table${(selectedAttendee.donatedTables || 0) !== 1 ? 's' : ''} (${selectedAttendee.donatedSeats} seat${(selectedAttendee.donatedSeats || 0) !== 1 ? 's' : ''})`
                                  : `${selectedAttendee.donatedSeats} seat${(selectedAttendee.donatedSeats || 0) !== 1 ? 's' : ''}`
                                }
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {selectedAttendee.donationType === 'table'
                                  ? 'Full table(s) donated for others to attend'
                                  : 'Extra tickets donated for others to attend'
                                }
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Dietary Preferences */}
                        {selectedAttendee.dietaryPreferences && (
                          <div className="pt-4 mt-4 border-t border-slate-100">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Dietary Preferences</label>
                            <div className="text-sm text-slate-700">{selectedAttendee.dietaryPreferences}</div>
                          </div>
                        )}

                        {/* Guest badge */}
                        {selectedAttendee.isPrimary === false && (
                          <div className="pt-4 mt-4 border-t border-slate-100">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">Guest Ticket</span>
                            {selectedAttendee.primaryAttendeeId && (
                              <button
                                onClick={() => {
                                  setActiveTab('tables');
                                  setSearchTerm(selectedAttendee.primaryAttendeeId || '');
                                  setSelectedAttendee(null);
                                }}
                                className="text-[10px] text-indigo-500 ml-2 hover:underline hover:text-indigo-700 font-medium"
                              >
                                Linked to: {selectedAttendee.primaryAttendeeId.substring(0, 8)}...
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedAttendee.answers && Object.keys(selectedAttendee.answers).length > 0 && (
                      <div className="animate-fade-in">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-4 pt-4 border-t border-slate-100">Form Responses</h4>
                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                          {Object.entries(selectedAttendee.answers).map(([key, val]) => (
                            <div key={key} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] font-bold text-slate-400 block mb-1 uppercase truncate">{key.replace('field_', '').replace(/_/g, ' ')}</span>
                              <span className="text-xs text-slate-900 font-semibold block">
                                {Array.isArray(val) ? val.join(', ') : String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 p-2 rounded-lg">
                  <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Export Attendees</h3>
                  <p className="text-sm text-gray-500">Choose which fields to include in your CSV.</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(fieldLabels).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => toggleField(key)}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all text-sm ${exportFields[key]
                      ? 'border-indigo-200 bg-indigo-50/50 text-indigo-700 font-medium'
                      : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200'
                      }`}
                  >
                    <span>{label}</span>
                    {exportFields[key] ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-gray-300" />
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExportCSV}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" /> Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendeeList;