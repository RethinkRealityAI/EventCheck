import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload, Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Circle, Loader2,
  Send as SendIcon, Trash2, Tag, Users, ChevronDown,
} from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  getImportBatches, getImportedContacts, deleteImportBatch, deleteImportedContact,
  type ImportBatch, type ImportedContact, type ContactEmailStatus,
} from '../../services/importedContactsService';
import { useNotifications } from '../NotificationSystem';
import BulkImportModal from '../BulkImport/BulkImportModal';

interface Props {
  settings: AppSettings | null;
}

type StatusFilter = 'all' | ContactEmailStatus;

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function StatusPill({ status }: { status: ContactEmailStatus }) {
  const map: Record<ContactEmailStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    sent: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Sent' },
    failed: { cls: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="w-3 h-3" />, label: 'Failed' },
    skipped: { cls: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertTriangle className="w-3 h-3" />, label: 'Skipped' },
    sending: { cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Sending' },
    pending: { cls: 'bg-slate-50 text-slate-600 border-slate-200', icon: <Circle className="w-3 h-3" />, label: 'Not sent' },
  };
  const m = map[status];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${m.cls}`}>{m.icon}{m.label}</span>;
}

export default function ImportedContactsTab({ settings }: Props) {
  const { showNotification } = useNotifications();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | { mode: 'import' } | { mode: 'resume'; label: string; contacts: ImportedContact[] }>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, c] = await Promise.all([
        getImportBatches(),
        getImportedContacts(batchFilter === 'all' ? {} : { batchId: batchFilter }),
      ]);
      setBatches(b);
      setContacts(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [batchFilter]);

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (statusFilter !== 'all' && c.emailStatus !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(c.name || '').toLowerCase().includes(s) && !c.email.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [contacts, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { total: contacts.length, sent: 0, failed: 0, pending: 0, skipped: 0 };
    for (const x of contacts) {
      if (x.emailStatus === 'sent') c.sent++;
      else if (x.emailStatus === 'failed') c.failed++;
      else if (x.emailStatus === 'skipped') c.skipped++;
      else c.pending++;
    }
    return c;
  }, [contacts]);

  // Contacts eligible to (re)send within the current filter: not yet sent.
  const unsentInFilter = useMemo(
    () => filtered.filter(c => c.emailStatus === 'pending' || c.emailStatus === 'failed'),
    [filtered],
  );

  const openResend = () => {
    if (unsentInFilter.length === 0) {
      showNotification('Nothing to send — all matching contacts are already sent or skipped.', 'info');
      return;
    }
    const label = batchFilter === 'all'
      ? 'All contacts'
      : (batches.find(b => b.id === batchFilter)?.label || 'Contacts');
    setModal({ mode: 'resume', label, contacts: unsentInFilter });
  };

  const removeBatch = async (b: ImportBatch) => {
    if (!window.confirm(`Delete the "${b.label}" import (${b.totalCount} contacts)? This cannot be undone.`)) return;
    try {
      await deleteImportBatch(b.id);
      showNotification(`Deleted "${b.label}"`, 'success');
      if (batchFilter === b.id) setBatchFilter('all');
      else load();
    } catch (e: any) {
      showNotification(`Delete failed: ${e?.message || 'error'}`, 'error');
    }
  };

  const removeContact = async (c: ImportedContact) => {
    try {
      await deleteImportedContact(c.id);
      setContacts(prev => prev.filter(x => x.id !== c.id));
    } catch (e: any) {
      showNotification(`Delete failed: ${e?.message || 'error'}`, 'error');
    }
  };

  const smtpReady = !!(settings?.smtpUser && settings?.smtpPass);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white/60 backdrop-blur-sm p-3 rounded-lg border border-white/40">
        <button
          onClick={() => setModal({ mode: 'import' })}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition shadow-sm"
        >
          <Upload className="w-4 h-4" /> Bulk import
        </button>

        {/* Batch filter */}
        <div className="relative">
          <select
            value={batchFilter}
            onChange={e => setBatchFilter(e.target.value)}
            className="appearance-none pr-8 pl-3 py-2 border border-white/40 rounded-lg text-sm font-medium bg-white/80 outline-none focus:ring-2 focus:ring-indigo-500 max-w-[260px]"
          >
            <option value="all">All imports ({batches.length})</option>
            {batches.map(b => (
              <option key={b.id} value={b.id}>{b.label} · {b.totalCount}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200">
          {([
            ['all', `All (${counts.total})`],
            ['sent', `Sent (${counts.sent})`],
            ['failed', `Failed (${counts.failed})`],
            ['pending', `Not sent (${counts.pending})`],
          ] as Array<[StatusFilter, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${statusFilter === key ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name or email…"
            className="pl-9 pr-4 py-2 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white/80"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <button
          onClick={openResend}
          disabled={!smtpReady || unsentInFilter.length === 0}
          title={!smtpReady ? 'Configure SMTP in Settings first' : unsentInFilter.length === 0 ? 'No unsent contacts in this view' : `Email the ${unsentInFilter.length} unsent contacts`}
          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <SendIcon className="w-4 h-4" /> Email unsent ({unsentInFilter.length})
        </button>
      </div>

      {/* Batch chips (when viewing all) */}
      {batchFilter === 'all' && batches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {batches.map(b => (
            <div key={b.id} className="group inline-flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-200 text-xs">
              <Tag className="w-3 h-3 text-indigo-500" />
              <button onClick={() => setBatchFilter(b.id)} className="font-medium text-gray-700 hover:text-indigo-700">{b.label}</button>
              <span className="text-gray-400">{b.totalCount}</span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-400">{timeAgo(b.createdAt)}</span>
              <button onClick={() => removeBatch(b)} className="text-gray-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Delete this import">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!smtpReady && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> SMTP isn't configured. You can still import contacts, but sending is disabled until you add SMTP credentials in Settings.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Name</th>
              <th className="text-left px-4 py-2 font-semibold">Email</th>
              <th className="text-left px-4 py-2 font-semibold">Tag</th>
              <th className="text-left px-4 py-2 font-semibold">Email status</th>
              <th className="text-left px-4 py-2 font-semibold">Sent</th>
              <th className="text-right px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400"><Loader2 className="w-6 h-6 mx-auto animate-spin text-indigo-500" /></td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                {contacts.length === 0 ? 'No imported contacts yet. Click “Bulk import” to upload a CSV.' : 'No contacts match this filter.'}
              </td></tr>
            )}
            {!loading && filtered.slice(0, 500).map(c => (
              <tr key={c.id} className="hover:bg-indigo-50/30">
                <td className="px-4 py-2 font-medium text-gray-900">{c.name || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-gray-700">{c.email}</td>
                <td className="px-4 py-2"><span className="text-[11px] text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{c.tag || '—'}</span></td>
                <td className="px-4 py-2">
                  <StatusPill status={c.emailStatus} />
                  {c.emailStatus === 'failed' && c.emailError && (
                    <div className="text-[10px] text-red-500 mt-0.5 truncate max-w-[200px]" title={c.emailError}>{c.emailError}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500 text-xs" title={c.emailSentAt || ''}>{c.emailSentAt ? timeAgo(c.emailSentAt) : '—'}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => removeContact(c)} className="p-1 text-gray-300 hover:text-red-500 transition" title="Remove contact">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">Showing first 500 of {filtered.length}. Narrow with a filter or search.</div>
        )}
      </div>

      {modal && settings && (
        <BulkImportModal
          settings={settings}
          resume={modal.mode === 'resume' ? { label: modal.label, contacts: modal.contacts } : undefined}
          onClose={() => setModal(null)}
          onComplete={() => load()}
        />
      )}
    </div>
  );
}
