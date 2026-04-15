import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Attendee, Form, AppSettings, SeatingTable } from '../types';
import { LayoutDashboard, Users, ChevronDown, ChevronRight, UserPlus, CheckCircle, Clock, Search, Calendar, Eye, X, Mail, User, Download, FileSpreadsheet, Check, ChevronLeft, Filter, Loader2, Copy, ChevronsDown, ChevronsRight, Star, Pin, Plus, SlidersHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { updateAttendee, getSettings, saveSettings, getSeatingTables } from '../services/storageService';
import { useNotifications } from './NotificationSystem';
import AttendeeModal from './AttendeeModal';
import AddAttendeeModal from './AddAttendeeModal';
import ColumnVisibilityDropdown, { ColumnDef } from './ColumnVisibilityDropdown';

interface AttendeeListProps {
  attendees: Attendee[];
  forms: Form[];
  isLoading?: boolean;
}

const STANDARD_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', group: 'standard' },
  { key: 'formTitle', label: 'Event/Form', group: 'standard' },
  { key: 'ticketType', label: 'Ticket Type', group: 'standard' },
  { key: 'status', label: 'Status', group: 'standard' },
  { key: 'registered', label: 'Registered', group: 'standard' },
  { key: 'actions', label: 'Actions', group: 'standard' },
];

const AttendeeList: React.FC<AttendeeListProps> = ({ attendees, forms, isLoading = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'live' | 'test' | 'donated' | 'tables' | 'sponsor-tickets'>('live');
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null);
  const { showNotification } = useNotifications();
  const [showExportModal, setShowExportModal] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Collapsed state for tables
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});

  // New state for form filtering, settings, columns, seating, add modal
  const [selectedFormId, setSelectedFormId] = useState<string>('_all');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  const [seatingTables, setSeatingTables] = useState<SeatingTable[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Advanced Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked-in' | 'pending'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'free' | 'pending'>('all');

  // Response Filter State
  const [responseFilters, setResponseFilters] = useState<Array<{ fieldId: string, value: string }>>([]);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterFieldSelection, setFilterFieldSelection] = useState<string | null>(null);
  const filterPickerRef = useRef<HTMLDivElement>(null);

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

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const s = await getSettings();
      setSettings(s);
      if (s.defaultDashboardFormId) {
        setSelectedFormId(s.defaultDashboardFormId);
      }
    };
    loadSettings();
  }, []);

  // When selectedFormId changes, fetch seating tables
  useEffect(() => {
    if (selectedFormId && selectedFormId !== '_all') {
      const loadTables = async () => {
        const tables = await getSeatingTables(selectedFormId);
        setSeatingTables(tables);
      };
      loadTables();
    } else {
      setSeatingTables([]);
    }
  }, [selectedFormId]);

  // When selectedFormId or settings change, load column visibility prefs
  useEffect(() => {
    if (settings && selectedFormId) {
      const prefs = settings.dashboardColumnPrefs?.[selectedFormId] || {};
      setColumnVisibility(prefs);
    }
  }, [selectedFormId, settings]);

  // Compute dynamic form columns
  const dynamicColumns: ColumnDef[] = useMemo(() => {
    if (selectedFormId === '_all') return [];
    const form = forms.find(f => f.id === selectedFormId);
    if (!form) return [];
    return form.fields
      .filter(f => f.type !== 'ticket')
      .map(f => ({
        key: 'answer_' + f.id,
        label: f.label,
        group: 'form' as const,
      }));
  }, [selectedFormId, forms]);

  const selectedForm = useMemo(() => forms.find(f => f.id === selectedFormId), [forms, selectedFormId]);

  const sponsorPrimaryIds = useMemo(
    () => new Set(attendees.filter(a => a.isPrimary && a.sponsorTier).map(a => a.id)),
    [attendees]
  );

  const allColumns = useMemo(() => [...STANDARD_COLUMNS, ...dynamicColumns], [dynamicColumns]);

  const isColumnVisible = useCallback((key: string) => {
    // actions column is always visible
    if (key === 'actions') return true;
    return columnVisibility[key] !== false;
  }, [columnVisibility]);

  const visibleColumnCount = useMemo(() => {
    return allColumns.filter(c => isColumnVisible(c.key)).length;
  }, [allColumns, isColumnVisible]);

  const handleToggleColumn = useCallback(async (key: string) => {
    const newVis = { ...columnVisibility, [key]: columnVisibility[key] === false ? true : false };
    setColumnVisibility(newVis);
    // Persist
    if (settings) {
      const newSettings = {
        ...settings,
        dashboardColumnPrefs: {
          ...settings.dashboardColumnPrefs,
          [selectedFormId]: newVis,
        },
      };
      setSettings(newSettings);
      await saveSettings(newSettings);
    }
  }, [columnVisibility, settings, selectedFormId]);

  const handleShowAllColumns = useCallback(async () => {
    const newVis: Record<string, boolean> = {};
    allColumns.forEach(c => { newVis[c.key] = true; });
    setColumnVisibility(newVis);
    if (settings) {
      const newSettings = {
        ...settings,
        dashboardColumnPrefs: {
          ...settings.dashboardColumnPrefs,
          [selectedFormId]: newVis,
        },
      };
      setSettings(newSettings);
      await saveSettings(newSettings);
    }
  }, [allColumns, settings, selectedFormId]);

  const handleHideAllColumns = useCallback(async () => {
    const newVis: Record<string, boolean> = {};
    allColumns.forEach(c => { newVis[c.key] = c.key === 'actions' ? true : false; });
    setColumnVisibility(newVis);
    if (settings) {
      const newSettings = {
        ...settings,
        dashboardColumnPrefs: {
          ...settings.dashboardColumnPrefs,
          [selectedFormId]: newVis,
        },
      };
      setSettings(newSettings);
      await saveSettings(newSettings);
    }
  }, [allColumns, settings, selectedFormId]);

  const handleSetDefaultForm = async () => {
    if (!settings) return;
    const newDefault = selectedFormId === '_all' ? undefined : selectedFormId;
    const newSettings = { ...settings, defaultDashboardFormId: newDefault };
    setSettings(newSettings);
    await saveSettings(newSettings);
    showNotification(newDefault ? 'Default form view saved' : 'Default form view cleared', 'success');
  };

  // Close filter picker on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPickerRef.current && !filterPickerRef.current.contains(e.target as Node)) {
        setShowFilterPicker(false);
        setFilterFieldSelection(null);
      }
    };
    if (showFilterPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterPicker]);

  // Clear response filters when form changes
  useEffect(() => {
    setResponseFilters([]);
  }, [selectedFormId]);

  const handleAddResponseFilter = (fieldId: string, value: string) => {
    setResponseFilters(prev => [...prev, { fieldId, value }]);
    setShowFilterPicker(false);
    setFilterFieldSelection(null);
    setCurrentPage(1);
  };

  const handleRemoveResponseFilter = (index: number) => {
    setResponseFilters(prev => prev.filter((_, i) => i !== index));
    setCurrentPage(1);
  };

  const toggleTable = (id: string) => {
    setExpandedTables(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter logic
  const filtered = attendees.filter(a => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesForm = selectedFormId === '_all' || a.formId === selectedFormId;

    const isTest = !!a.isTest;
    let matchesTab = false;
    if (activeTab === 'test') matchesTab = isTest;
    else if (activeTab === 'donated') matchesTab = !isTest && ((a.donatedSeats || 0) > 0 || (a.donatedTables || 0) > 0);
    else if (activeTab === 'tables') matchesTab = !isTest;
    else if (activeTab === 'sponsor-tickets') matchesTab = !a.isPrimary && !!a.primaryAttendeeId && sponsorPrimaryIds.has(a.primaryAttendeeId);
    else matchesTab = !isTest;

    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'checked-in' ? !!a.checkedInAt : !a.checkedInAt;

    const matchesPayment = paymentFilter === 'all'
      ? true
      : a.paymentStatus === paymentFilter;

    const matchesResponseFilters = responseFilters.every(rf => {
      const answer = a.answers?.[rf.fieldId];
      if (rf.value === '__has_response__') {
        return answer !== undefined && answer !== null && answer !== '';
      }
      if (Array.isArray(answer)) {
        return answer.includes(rf.value);
      }
      return String(answer || '') === rf.value;
    });

    return matchesSearch && matchesForm && matchesTab && matchesStatus && matchesPayment && matchesResponseFilters;
  });

  // Count donated seats for badge
  const totalDonatedCount = attendees.filter(a => !a.isTest && ((a.donatedSeats || 0) > 0 || (a.donatedTables || 0) > 0)).length;

  // Pagination Logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(startIndex, startIndex + itemsPerPage);

  // Grouping Logic for "Tables" view
  const groupedByTable = useMemo(() => {
    const formFilteredAttendees = attendees.filter(a => {
      const matchesForm = selectedFormId === '_all' || a.formId === selectedFormId;
      return !a.isTest && matchesForm;
    });
    const tables: Record<string, { primary: Attendee, guests: Attendee[] }> = {};

    formFilteredAttendees.forEach(a => {
      if (a.isPrimary !== false) {
        tables[a.id] = { primary: a, guests: [] };
      }
    });

    formFilteredAttendees.forEach(a => {
      if (a.isPrimary === false && a.primaryAttendeeId && tables[a.primaryAttendeeId]) {
        tables[a.primaryAttendeeId].guests.push(a);
      }
    });

    // Only show table purchasers (a table = 8 seats: 1 purchaser + 7 guests)
    let result = Object.values(tables).filter(t => t.guests.length >= 7);
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.primary.name.toLowerCase().includes(lowerSearch) ||
        t.primary.email.toLowerCase().includes(lowerSearch) ||
        t.guests.some(g => (g.name || '').toLowerCase().includes(lowerSearch) || (g.email || '').toLowerCase().includes(lowerSearch))
      );
    }

    return result.sort((a, b) => b.primary.registeredAt.localeCompare(a.primary.registeredAt));
  }, [attendees, searchTerm, selectedFormId]);

  // Pagination for Tables
  const totalTablePages = Math.ceil(groupedByTable.length / itemsPerPage);
  const paginatedTables = groupedByTable.slice(startIndex, startIndex + itemsPerPage);

  const handleDeleteAttendee = async (_id: string) => {
    setSelectedAttendee(null);
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
    const url = `${window.location.origin}/#/form/${formId}?ref=${primaryId}`;
    navigator.clipboard.writeText(url);
    showNotification("Guest registration link copied to clipboard!", 'success');
  };

  const handleSeatingAssignment = async (attendeeId: string, tableId: string | null) => {
    await updateAttendee(attendeeId, { assignedTableId: tableId, assignedSeat: null });
    showNotification(tableId ? 'Assigned to table' : 'Removed from table', 'success');
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

    const headers = selectedKeys.map(key => fieldLabels[key] || key).join(',');

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
    <div className="bg-white/60 backdrop-blur-3xl rounded-3xl shadow-2xl shadow-indigo-500/10 border border-white/60 overflow-hidden flex flex-col h-full relative z-10 hover:shadow-indigo-500/20 transition-shadow duration-500">
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent pointer-events-none"></div>
      {/* Header & Tabs */}
      <div className="p-5 border-b border-white/40 space-y-4 relative z-10 backdrop-blur-2xl bg-white/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-3">
            <h2 className="font-semibold text-lg text-gray-900">Registered Attendees</h2>
            <div className="flex items-center gap-1 bg-white/50 backdrop-blur-sm p-1 rounded-lg w-fit border border-white/40">
              <button
                onClick={() => { setActiveTab('live'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${activeTab === 'live' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Live
              </button>
              <button
                onClick={() => { setActiveTab('donated'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${activeTab === 'donated' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Donated
                {totalDonatedCount > 0 && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalDonatedCount}</span>}
              </button>
              <button
                onClick={() => { setActiveTab('tables'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${activeTab === 'tables' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                <LayoutDashboard className="w-3 h-3" /> Tables
              </button>
              <button
                onClick={() => { setActiveTab('sponsor-tickets'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${activeTab === 'sponsor-tickets' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Sponsor Tickets
              </button>
              <button
                onClick={() => { setActiveTab('test'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${activeTab === 'test' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Test
              </button>
              {/* Separator */}
              <div className="h-5 w-px bg-gray-300/50 mx-1"></div>
              {/* Form Selector */}
              <select
                value={selectedFormId}
                onChange={e => { setSelectedFormId(e.target.value); setCurrentPage(1); }}
                className="px-2 py-1 border border-white/40 rounded-md text-xs font-medium bg-white/80 backdrop-blur-sm outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px]"
              >
                <option value="_all">All Forms</option>
                {forms.map(f => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
              <button
                onClick={handleSetDefaultForm}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all border text-xs font-bold ml-1 ${settings?.defaultDashboardFormId === selectedFormId && selectedFormId !== '_all'
                  ? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm'
                  : 'bg-white/40 text-slate-500 border-white/40 hover:bg-white hover:text-blue-500 hover:border-blue-100 hover:shadow-sm'
                }`}
                title={settings?.defaultDashboardFormId === selectedFormId && selectedFormId !== '_all' ? 'This is your default view' : 'Set as default view'}
              >
                <Pin className={`w-3.5 h-3.5 transition-transform ${settings?.defaultDashboardFormId === selectedFormId && selectedFormId !== '_all' ? 'fill-blue-500 text-blue-600 -rotate-12 scale-110' : ''}`} />
                {settings?.defaultDashboardFormId === selectedFormId && selectedFormId !== '_all' ? 'Pinned' : 'Pin'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-2 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white/80 backdrop-blur-sm"
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

            <ColumnVisibilityDropdown
              columns={allColumns}
              visibleColumns={columnVisibility}
              onToggle={handleToggleColumn}
              onShowAll={handleShowAllColumns}
              onHideAll={handleHideAllColumns}
            />

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm"
              title="Add attendee manually"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>

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
          <div className="flex flex-wrap items-center gap-2 text-sm bg-white/50 backdrop-blur-sm p-3 rounded-lg border border-white/40">
            <button
              onClick={handleExpandAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 border border-white/40 rounded-md text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition shadow-sm"
            >
              <ChevronsDown className="w-4 h-4" /> Expand All
            </button>
            <button
              onClick={handleCollapseAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 border border-white/40 rounded-md text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition shadow-sm"
            >
              <ChevronsRight className="w-4 h-4" /> Collapse All
            </button>
            <div className="h-6 w-px bg-gray-200/50 mx-2"></div>
            <span className="text-slate-400 text-xs font-medium">
              Showing {paginatedTables.length} table{paginatedTables.length !== 1 ? 's' : ''} on this page
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 text-sm bg-white/60 backdrop-blur-2xl p-4 rounded-2xl border border-white/60 shadow-xl shadow-indigo-500/5">
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

            {/* Response Filters */}
            {selectedFormId !== '_all' && selectedForm && (
              <>
                <div className="h-6 w-px bg-gray-200/50 mx-1"></div>

                {/* Active filter pills */}
                {responseFilters.map((rf, idx) => {
                  const field = selectedForm.fields.find(f => f.id === rf.fieldId);
                  const displayValue = rf.value === '__has_response__' ? 'Has response' : rf.value;
                  return (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50/80 text-indigo-700 border border-indigo-200/50"
                    >
                      <span className="max-w-[100px] truncate" title={field?.label}>{field?.label || rf.fieldId}</span>
                      <span className="text-indigo-400">:</span>
                      <span className="max-w-[80px] truncate" title={displayValue}>{displayValue}</span>
                      <button
                        onClick={() => handleRemoveResponseFilter(idx)}
                        className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}

                {/* Add Filter button + dropdown */}
                <div className="relative" ref={filterPickerRef}>
                  <button
                    onClick={() => { setShowFilterPicker(!showFilterPicker); setFilterFieldSelection(null); }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 border border-dashed border-slate-300 hover:border-indigo-300 transition"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    + Filter
                  </button>

                  {showFilterPicker && (
                    <div className="fixed inset-0 z-[100]" onClick={() => { setShowFilterPicker(false); setFilterFieldSelection(null); }}>
                      <div
                        className="absolute bg-white rounded-xl shadow-2xl border border-gray-200 w-[360px] max-h-[320px] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-1 duration-150"
                        style={{
                          top: (filterPickerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                          left: filterPickerRef.current?.getBoundingClientRect().left ?? 0,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {filterFieldSelection === null ? (
                          <>
                            <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 bg-gray-50/80 flex-shrink-0">
                              Select a field to filter by
                            </div>
                            <div className="overflow-y-auto flex-1">
                              {selectedForm.fields
                                .filter(f => f.type !== 'ticket')
                                .map(field => {
                                  const hasOptions = field.options && field.options.length > 0 && ['select', 'radio', 'checkbox'].includes(field.type);
                                  return (
                                    <button
                                      key={field.id}
                                      onClick={() => {
                                        if (hasOptions) {
                                          setFilterFieldSelection(field.id);
                                        } else {
                                          handleAddResponseFilter(field.id, '__has_response__');
                                        }
                                      }}
                                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition flex items-center justify-between gap-3 border-b border-gray-50 last:border-0"
                                    >
                                      <span className="line-clamp-2 leading-snug">{field.label}</span>
                                      {hasOptions ? (
                                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                      ) : (
                                        <span className="text-gray-400 text-[10px] flex-shrink-0 whitespace-nowrap">(has response)</span>
                                      )}
                                    </button>
                                  );
                                })}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2 flex-shrink-0">
                              <button onClick={() => setFilterFieldSelection(null)} className="hover:text-gray-600 transition p-0.5 rounded hover:bg-gray-200">
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <span className="line-clamp-1">{selectedForm.fields.find(f => f.id === filterFieldSelection)?.label}</span>
                            </div>
                            <div className="overflow-y-auto flex-1">
                              <button
                                onClick={() => handleAddResponseFilter(filterFieldSelection, '__has_response__')}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-indigo-50 hover:text-indigo-700 transition italic border-b border-gray-50"
                              >
                                Has any response
                              </button>
                              {selectedForm.fields
                                .find(f => f.id === filterFieldSelection)
                                ?.options?.map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => handleAddResponseFilter(filterFieldSelection, opt)}
                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition border-b border-gray-50 last:border-0"
                                  >
                                    {opt}
                                  </button>
                                ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto flex-1 custom-scrollbar">
        {activeTab === 'tables' ? (
          <div className="p-4 space-y-4">
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
              paginatedTables.map(({ primary, guests }) => {
                const adultCount = guests.filter(g => g.guestType !== 'child').length + (primary.guestType !== 'child' ? 1 : 0);
                const childCount = guests.filter(g => g.guestType === 'child').length + (primary.guestType === 'child' ? 1 : 0);

                return (
                  <div key={primary.id} className="bg-white/40 backdrop-blur-md rounded-2xl border border-white/60 group transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-0.5 overflow-hidden">
                    <div
                      onClick={() => toggleTable(primary.id)}
                      className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/80 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 rounded-xl group-hover:from-indigo-600 group-hover:to-indigo-700 group-hover:text-white transition-all duration-300 shadow-sm border border-indigo-100">
                          <LayoutDashboard className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 flex items-center gap-2">
                            Table: {primary.name}
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                              {guests.length + 1} Seat{(guests.length + 1) !== 1 ? 's' : ''}
                              {childCount > 0 ? ` (${adultCount} Adult${adultCount !== 1 ? 's' : ''}, ${childCount} Child${childCount !== 1 ? 'ren' : ''})` : ''}
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
                                {seatingTables.length > 0 && <th className="px-4 py-3">Seating Table</th>}
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
                                <td className="px-4 py-3 flex gap-1">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-indigo-100 text-indigo-700 border border-indigo-200">Purchaser</span>
                                  {primary.guestType === 'child' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-blue-100 text-blue-700 border border-blue-200">Child</span>}
                                  {primary.guestType === 'adult' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-slate-100 text-slate-700 border border-slate-200">Adult</span>}
                                </td>
                                <td className="px-4 py-3 text-gray-500">{primary.ticketType}</td>
                                <td className="px-4 py-3 text-center">
                                  {primary.checkedInAt ? (
                                    <Check className="w-4 h-4 text-green-500 mx-auto" strokeWidth={3} />
                                  ) : (
                                    <Clock className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                                  )}
                                </td>
                                {seatingTables.length > 0 && (
                                  <td className="px-4 py-3">
                                    <select
                                      value={primary.assignedTableId || ''}
                                      onChange={e => handleSeatingAssignment(primary.id, e.target.value || null)}
                                      onClick={e => e.stopPropagation()}
                                      className="px-2 py-1 border border-gray-200 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="">Unassigned</option>
                                      {seatingTables.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                )}
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
                                  <td className="px-4 py-3 flex gap-1">
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-purple-100 text-purple-700 border border-purple-200">Guest</span>
                                    {g.guestType === 'child' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-blue-100 text-blue-700 border border-blue-200">Child</span>}
                                    {g.guestType === 'adult' && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tight bg-slate-100 text-slate-700 border border-slate-200">Adult</span>}
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 italic">{g.ticketType}</td>
                                  <td className="px-4 py-3 text-center">
                                    {g.checkedInAt ? (
                                      <Check className="w-4 h-4 text-green-500 mx-auto" strokeWidth={3} />
                                    ) : (
                                      <Clock className="w-3.5 h-3.5 text-slate-300 mx-auto" />
                                    )}
                                  </td>
                                  {seatingTables.length > 0 && (
                                    <td className="px-4 py-3">
                                      <select
                                        value={g.assignedTableId || ''}
                                        onChange={e => handleSeatingAssignment(g.id, e.target.value || null)}
                                        onClick={e => e.stopPropagation()}
                                        className="px-2 py-1 border border-gray-200 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        <option value="">Unassigned</option>
                                        {seatingTables.map(t => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    </td>
                                  )}
                                  <td className="px-4 py-3 text-right pr-6">
                                    <button onClick={() => setSelectedAttendee(g)} className="text-indigo-600 hover:underline font-bold">View</button>
                                  </td>
                                </tr>
                              ))}
                              {guests.length === 0 && (
                                <tr>
                                  <td colSpan={seatingTables.length > 0 ? 6 : 5} className="px-4 py-8 text-center text-slate-400 italic bg-white/20">
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
                )
              })
            )}
          </div>
        ) : (
          <table className="min-w-max w-full text-left text-sm text-gray-600">
            <thead className="bg-white/80 backdrop-blur-xl border-b border-white/60 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
              <tr>
                {isColumnVisible('name') && <th className="px-4 py-2.5 min-w-[180px] text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>}
                {isColumnVisible('formTitle') && <th className="px-4 py-2.5 min-w-[140px] text-xs font-semibold uppercase tracking-wide text-gray-500">Event/Form</th>}
                {isColumnVisible('ticketType') && <th className="px-4 py-2.5 min-w-[110px] text-xs font-semibold uppercase tracking-wide text-gray-500">Ticket Type</th>}
                {isColumnVisible('status') && <th className="px-4 py-2.5 min-w-[100px] text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>}
                {isColumnVisible('registered') && <th className="px-4 py-2.5 min-w-[100px] text-xs font-semibold uppercase tracking-wide text-gray-500">Registered</th>}
                {dynamicColumns.map(col =>
                  isColumnVisible(col.key) ? (
                    <th key={col.key} className="px-4 py-2.5 min-w-[180px] max-w-[240px]" title={col.label}>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 line-clamp-2 block leading-tight">{col.label}</span>
                    </th>
                  ) : null
                )}
                {isColumnVisible('actions') && <th className="px-4 py-2.5 min-w-[60px] text-xs font-semibold uppercase tracking-wide text-gray-500 text-right sticky right-0 bg-gray-50/95 backdrop-blur-sm z-20 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/50">
              {isLoading ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                      <p className="text-sm font-medium">Loading attendees...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="px-4 py-12 text-center text-gray-400">
                    <User className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p>No attendees match your filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((attendee) => (
                  <tr key={attendee.id} className="hover:bg-white/60 transition">
                    {isColumnVisible('name') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900">{attendee.name}</div>
                          {attendee.isPrimary === false && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">GUEST</span>
                          )}
                          {attendee.guestType === 'child' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">CHILD</span>
                          )}
                          {attendee.guestType === 'adult' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">ADULT</span>
                          )}
                          {((attendee.donatedSeats || 0) > 0 || (attendee.donatedTables || 0) > 0) && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              {attendee.donationType === 'table' && (attendee.donatedTables || 0) > 0
                                ? `${attendee.donatedTables} tbl (${attendee.donatedSeats})`
                                : `${attendee.donatedSeats}`
                              }
                            </span>
                          )}
                        </div>
                        <div className="text-gray-400 text-xs">{attendee.email}</div>
                      </td>
                    )}
                    {isColumnVisible('formTitle') && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          <span className="truncate max-w-[150px] block" title={attendee.formTitle}>
                            {attendee.formTitle || 'Unknown Event'}
                          </span>
                        </div>
                      </td>
                    )}
                    {isColumnVisible('ticketType') && (
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                          {attendee.ticketType}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('status') && (
                      <td className="px-4 py-3">
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
                    )}
                    {isColumnVisible('registered') && (
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {format(new Date(attendee.registeredAt), 'MMM d, yyyy')}
                      </td>
                    )}
                    {dynamicColumns.map(col => {
                      if (!isColumnVisible(col.key)) return null;
                      const fieldId = col.key.replace('answer_', '');
                      const val = attendee.answers?.[fieldId];
                      return (
                        <td key={col.key} className="px-4 py-3 text-gray-600 text-xs">
                          {val !== undefined && val !== null
                            ? (Array.isArray(val) ? val.join(', ') : String(val))
                            : <span className="text-gray-300">-</span>
                          }
                        </td>
                      );
                    })}
                    {isColumnVisible('actions') && (
                      <td className="px-4 py-3 text-right sticky right-0 bg-white/95 backdrop-blur-sm z-10 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                        <button
                          onClick={() => setSelectedAttendee(attendee)}
                          className="text-indigo-600 hover:text-indigo-800 hover:bg-white/80 hover:shadow-sm p-2 rounded-lg transition"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-white/20 bg-white/60 backdrop-blur-sm flex items-center justify-between">
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
        <AttendeeModal
          attendee={selectedAttendee}
          forms={forms}
          seatingTables={seatingTables}
          onClose={() => setSelectedAttendee(null)}
          onDelete={handleDeleteAttendee}
        />
      )}

      {/* Add Attendee Modal */}
      {showAddModal && (
        <AddAttendeeModal
          forms={forms}
          selectedFormId={selectedFormId}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            // The parent component's polling will pick up the new attendee
            setShowAddModal(false);
          }}
        />
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
