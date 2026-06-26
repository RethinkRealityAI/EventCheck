import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload, Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Circle, Loader2,
  Send as SendIcon, Trash2, Tag, Users, ChevronDown, Ticket, Plus, Minus, X, TicketCheck,
} from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  getImportBatches, getImportedContacts, deleteImportBatch, deleteImportedContact,
  listDistinctTags, addTagsToContacts, removeTagFromContacts, contactMatchesTags,
  type ImportBatch, type ImportedContact, type ContactEmailStatus,
} from '../../services/importedContactsService';
import { useNotifications } from '../NotificationSystem';
import BulkImportModal from '../BulkImport/BulkImportModal';

interface Props {
  settings: AppSettings | null;
}

// 'registered' is a synthetic status (contact has a linked attendee), not an
// email_status value — handled separately in the filter.
type StatusFilter = 'all' | ContactEmailStatus | 'registered';

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

// Modal launch descriptors. `import` is the CSV upload flow; `resume` and
// `invite` both carry a pre-targeted audience (the multi-selected contacts).
type ModalState =
  | { mode: 'import' }
  | { mode: 'resume'; label: string; contacts: ImportedContact[] }
  | { mode: 'invite'; label: string; contacts: ImportedContact[] };

export default function ImportedContactsTab({ settings }: Props) {
  const { showNotification } = useNotifications();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [contacts, setContacts] = useState<ImportedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState | null>(null);

  // Tagging + multi-select
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);   // OR-semantics
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const tagMenuRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, c, tags] = await Promise.all([
        getImportBatches(),
        getImportedContacts(batchFilter === 'all' ? {} : { batchId: batchFilter }),
        listDistinctTags(),
      ]);
      setBatches(b);
      setContacts(c);
      setAllTags(tags);
      // Drop any selections that no longer exist after a reload.
      setSelected(prev => {
        const present = new Set(c.map(x => x.id));
        const next = new Set<string>();
        prev.forEach(id => { if (present.has(id)) next.add(id); });
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [batchFilter]);

  // Close the tag dropdown on outside click.
  useEffect(() => {
    if (!tagMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)) setTagMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [tagMenuOpen]);

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (statusFilter === 'registered') {
        if (!c.registeredAt) return false;
      } else if (statusFilter !== 'all' && c.emailStatus !== statusFilter) {
        return false;
      }
      if (!contactMatchesTags(c, tagFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(c.name || '').toLowerCase().includes(s)
          && !c.email.toLowerCase().includes(s)
          && !(c.tags || []).some(t => t.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [contacts, statusFilter, search, tagFilter]);

  const counts = useMemo(() => {
    const c = { total: contacts.length, sent: 0, failed: 0, pending: 0, skipped: 0, registered: 0 };
    for (const x of contacts) {
      if (x.emailStatus === 'sent') c.sent++;
      else if (x.emailStatus === 'failed') c.failed++;
      else if (x.emailStatus === 'skipped') c.skipped++;
      else c.pending++;
      if (x.registeredAt) c.registered++;
    }
    return c;
  }, [contacts]);

  // Contacts eligible to (re)send within the current filter: not yet sent.
  const unsentInFilter = useMemo(
    () => filtered.filter(c => c.emailStatus === 'pending' || c.emailStatus === 'failed'),
    [filtered],
  );

  // ── Selection helpers ──
  const filteredIds = useMemo(() => filtered.map(c => c.id), [filtered]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const someFilteredSelected = filteredIds.some(id => selected.has(id)) && !allFilteredSelected;

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllFiltered = () => {
    setSelected(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      filteredIds.forEach(id => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const selectedContacts = useMemo(
    () => contacts.filter(c => selected.has(c.id)),
    [contacts, selected],
  );

  const toggleTagFilter = (t: string) => {
    setTagFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

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

  // ── Bulk actions on the multi-selection ──
  const selectionLabel = `${selectedContacts.length} selected`;

  const bulkSendInvite = () => {
    if (selectedContacts.length === 0) return;
    setModal({ mode: 'invite', label: selectionLabel, contacts: selectedContacts });
  };
  const bulkResend = () => {
    if (selectedContacts.length === 0) return;
    setModal({ mode: 'resume', label: selectionLabel, contacts: selectedContacts });
  };
  const bulkAddTag = async () => {
    const raw = window.prompt(`Add a tag to ${selectedContacts.length} contact(s):`);
    const tag = (raw || '').trim();
    if (!tag) return;
    try {
      const n = await addTagsToContacts([...selected], [tag]);
      showNotification(`Tagged ${n} contact${n !== 1 ? 's' : ''} with "${tag}"`, 'success');
      await load();
    } catch (e: any) {
      showNotification(`Tagging failed: ${e?.message || 'error'}`, 'error');
    }
  };
  const bulkRemoveTag = async () => {
    // Offer tags that actually appear on the selection.
    const onSelection = Array.from(new Set(selectedContacts.flatMap(c => c.tags || []))).sort();
    if (onSelection.length === 0) {
      showNotification('The selected contacts have no tags to remove.', 'info');
      return;
    }
    const raw = window.prompt(
      `Remove which tag from ${selectedContacts.length} contact(s)?\n\nTags on selection: ${onSelection.join(', ')}`,
      onSelection[0],
    );
    const tag = (raw || '').trim();
    if (!tag) return;
    try {
      const n = await removeTagFromContacts([...selected], tag);
      showNotification(`Removed "${tag}" from ${n} contact${n !== 1 ? 's' : ''}`, 'success');
      await load();
    } catch (e: any) {
      showNotification(`Remove failed: ${e?.message || 'error'}`, 'error');
    }
  };
  const bulkDelete = async () => {
    if (selectedContacts.length === 0) return;
    if (!window.confirm(`Delete ${selectedContacts.length} selected contact(s)? This cannot be undone.`)) return;
    const ids = [...selected];
    let ok = 0;
    for (const id of ids) {
      try { await deleteImportedContact(id); ok++; } catch { /* keep going */ }
    }
    setContacts(prev => prev.filter(x => !selected.has(x.id)));
    clearSelection();
    showNotification(`Deleted ${ok} contact${ok !== 1 ? 's' : ''}`, ok === ids.length ? 'success' : 'info');
    // Refresh so allTags/counts reflect the deletion (mirrors the tag bulk actions).
    await load();
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
      setSelected(prev => { const n = new Set(prev); n.delete(c.id); return n; });
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
            aria-label="Filter by import batch"
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
            ['registered', `Registered (${counts.registered})`],
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

        {/* Tag filter (multi-select, OR-semantics) */}
        <div className="relative" ref={tagMenuRef}>
          <button
            onClick={() => setTagMenuOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition ${tagFilter.length ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white/80 border-white/40 text-gray-700 hover:bg-white'}`}
            aria-haspopup="listbox"
            aria-expanded={tagMenuOpen}
          >
            <Tag className="w-4 h-4" />
            {tagFilter.length ? `${tagFilter.length} tag${tagFilter.length !== 1 ? 's' : ''}` : 'Tags'}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {tagMenuOpen && (
            <div className="absolute z-20 mt-1 w-60 max-h-72 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg p-1" role="listbox">
              {allTags.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No tags yet.</div>}
              {tagFilter.length > 0 && (
                <button onClick={() => setTagFilter([])} className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded-md font-medium">
                  Clear tag filter
                </button>
              )}
              {allTags.map(t => {
                const active = tagFilter.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTagFilter(t)}
                    role="option"
                    aria-selected={active}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition ${active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${active ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                      {active && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{t}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email or tag…"
            className="pl-9 pr-4 py-2 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white/80"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search contacts"
          />
        </div>

        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition" title="Refresh" aria-label="Refresh">
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

      {/* Active tag-filter chips */}
      {tagFilter.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-500">Filtering by:</span>
          {tagFilter.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
              <Tag className="w-3 h-3" /> {t}
              <button onClick={() => toggleTagFilter(t)} className="hover:text-indigo-900" aria-label={`Remove ${t} from filter`}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-white shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold mr-1">
            <CheckCircle2 className="w-4 h-4" /> {selected.size} selected
          </span>
          <div className="h-5 w-px bg-white/30" />
          <BulkBtn onClick={bulkSendInvite} disabled={!smtpReady} title={!smtpReady ? 'Configure SMTP in Settings first' : 'Email a free-registration invite link'} icon={<Ticket className="w-4 h-4" />} label="Send registration invite" />
          <BulkBtn onClick={bulkResend} disabled={!smtpReady} title={!smtpReady ? 'Configure SMTP in Settings first' : 'Compose a campaign to these contacts'} icon={<SendIcon className="w-4 h-4" />} label="Resend campaign" />
          <BulkBtn onClick={bulkAddTag} icon={<Plus className="w-4 h-4" />} label="Add tag" />
          <BulkBtn onClick={bulkRemoveTag} icon={<Minus className="w-4 h-4" />} label="Remove tag" />
          <BulkBtn onClick={bulkDelete} icon={<Trash2 className="w-4 h-4" />} label="Delete" danger />
          <button onClick={clearSelection} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium text-white/90 hover:bg-white/15 transition">
            <X className="w-4 h-4" /> Clear
          </button>
        </div>
      )}

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
              <th className="px-3 py-2 w-10">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={allFilteredSelected}
                  ref={el => { if (el) el.indeterminate = someFilteredSelected; }}
                  onChange={toggleAllFiltered}
                  disabled={filteredIds.length === 0}
                  aria-label="Select all contacts in the current filter"
                  title="Select all in current filter"
                />
              </th>
              <th className="text-left px-4 py-2 font-semibold">Name</th>
              <th className="text-left px-4 py-2 font-semibold">Email</th>
              <th className="text-left px-4 py-2 font-semibold">Tags</th>
              <th className="text-left px-4 py-2 font-semibold">Email status</th>
              <th className="text-left px-4 py-2 font-semibold">Sent</th>
              <th className="text-right px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400"><Loader2 className="w-6 h-6 mx-auto animate-spin text-indigo-500" /></td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                <Users className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                {contacts.length === 0 ? 'No imported contacts yet. Click “Bulk import” to upload a CSV.' : 'No contacts match this filter.'}
              </td></tr>
            )}
            {!loading && filtered.slice(0, 500).map(c => {
              const isSel = selected.has(c.id);
              return (
                <tr key={c.id} className={`hover:bg-indigo-50/30 ${isSel ? 'bg-indigo-50/50' : ''}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={isSel}
                      onChange={() => toggleOne(c.id)}
                      aria-label={`Select ${c.name || c.email}`}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {c.name || <span className="text-gray-300">—</span>}
                      {/* Invite state is distinct from the campaign "Sent" email status:
                          invite_sent_at means a free-registration invite was emailed. */}
                      {c.inviteSentAt && !c.registeredAt && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full" title={`Invite sent ${timeAgo(c.inviteSentAt)}`}>
                          <Ticket className="w-3 h-3" /> Invited
                        </span>
                      )}
                      {c.registeredAt && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" title={`Registered ${timeAgo(c.registeredAt)}`}>
                          <TicketCheck className="w-3 h-3" /> Registered
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{c.email}</td>
                  <td className="px-4 py-2">
                    {(c.tags && c.tags.length) ? (
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {c.tags.map(t => (
                          <span key={t} className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={c.emailStatus} />
                    {c.emailStatus === 'failed' && c.emailError && (
                      <div className="text-[10px] text-red-500 mt-0.5 truncate max-w-[200px]" title={c.emailError}>{c.emailError}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs" title={c.emailSentAt || ''}>{c.emailSentAt ? timeAgo(c.emailSentAt) : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => removeContact(c)} className="p-1 text-gray-300 hover:text-red-500 transition" title="Remove contact" aria-label={`Remove ${c.name || c.email}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">Showing first 500 of {filtered.length}. Narrow with a filter or search.</div>
        )}
      </div>

      {modal && settings && (
        <BulkImportModal
          settings={settings}
          purpose={modal.mode === 'invite' ? 'invite' : 'campaign'}
          resume={modal.mode === 'resume' ? { label: modal.label, contacts: modal.contacts } : undefined}
          selectedContacts={modal.mode === 'invite' ? { label: modal.label, contacts: modal.contacts } : undefined}
          onClose={() => setModal(null)}
          onComplete={() => load()}
        />
      )}
    </div>
  );
}

function BulkBtn({ onClick, icon, label, disabled, title, danger }: {
  onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean; title?: string; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${danger ? 'bg-red-500/90 hover:bg-red-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white'}`}
    >
      {icon}{label}
    </button>
  );
}
