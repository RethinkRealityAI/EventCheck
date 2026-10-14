// components/BadgePrinting/BadgePrintingTab.tsx
//
// The badge-printing workspace for GANSID's registration vendor: the list in
// their spreadsheet layout, which badges still need printing, and a record of
// every batch exported. Read-only viewer accounts can use all of it — the only
// writes are reg-code assignment and batch recording, both through narrow
// SECURITY DEFINER functions (see services/badgePrintingService.ts).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw, Search, History, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Attendee, Form } from '../../types';
import { buildRegistrationIndex } from '../../utils/registrationKind';
import { daysAttendingOf, shortDayLabel } from '../../utils/daysAttending';
import {
  CONGRESS_DAYS, PRINT_STATUS_LABELS, buildBadgeRow, isBadgeEligible, printStatusOf,
  type BadgeFields, type BadgeRow, type PrintRecord, type PrintStatus,
} from '../../utils/badgeList';
import { downloadBadgeWorkbook } from '../../utils/badgeExport';
import {
  assignRegCodes, listPrintExports, loadExportSnapshot, loadPrintHistory, recordPrintExport, type PrintExport,
} from '../../services/badgePrintingService';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendees: Attendee[];
  forms: Form[];
  onRefresh?: () => void;
}

type StatusFilter = 'all' | 'to-print' | PrintStatus;
type SortKey = 'newest' | 'oldest' | 'regid' | 'name';

const STATUS_STYLES: Record<PrintStatus, string> = {
  new: 'bg-sky-50 text-sky-700 border-sky-200',
  changed: 'bg-amber-50 text-amber-800 border-amber-300',
  printed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const fmtDate = (iso: string) => (iso ? format(new Date(iso), 'd MMM yyyy') : '—');
const fmtDateTime = (iso: string) => (iso ? format(new Date(iso), 'd MMM yyyy, HH:mm') : '—');

export default function BadgePrintingTab({ attendees, forms, onRefresh }: Props) {
  const { showNotification } = useNotifications();

  const [exportsList, setExportsList] = useState<PrintExport[]>([]);
  const [history, setHistory] = useState<Map<string, PrintRecord[]>>(new Map());
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busy, setBusy] = useState<null | 'export' | 'codes' | 'redownload'>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [regStatusFilter, setRegStatusFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState<'all' | 'IND' | 'INT' | 'unknown'>('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [markPrinted, setMarkPrinted] = useState(true);

  // ── Rows ──
  const ctx = useMemo(() => {
    const formTypeById = new Map(forms.map(f => [f.id, f.formType || 'event'] as const));
    return {
      index: buildRegistrationIndex(attendees, id => (id ? formTypeById.get(id) : undefined)),
      attendeesById: new Map(attendees.map(a => [a.id, a] as const)),
      formById: new Map(forms.map(f => [f.id, f] as const)),
    };
  }, [attendees, forms]);

  const rows: BadgeRow[] = useMemo(
    () => attendees.filter(a => isBadgeEligible(a, ctx)).map(a => buildBadgeRow(a, ctx)),
    [attendees, ctx],
  );

  // ── Permanent codes: give every eligible row one, once ──
  const missingCodes = useMemo(() => rows.filter(r => !r.attendee.regCode), [rows]);
  useEffect(() => {
    if (missingCodes.length === 0 || busy) return;
    let cancelled = false;
    setBusy('codes');
    assignRegCodes(missingCodes.map(r => ({ id: r.attendee.id, region: r.region })))
      .then(() => { if (!cancelled) onRefresh?.(); })
      .catch(e => showNotification(`Could not assign registration IDs: ${(e as Error).message}`, 'error'))
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
    // Re-run only when the set of rows needing a code changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingCodes.map(r => r.attendee.id).join(',')]);

  // ── Print history ──
  const reloadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const ex = await listPrintExports();
      setExportsList(ex);
      setHistory(await loadPrintHistory(ex));
    } catch (e) {
      showNotification(`Could not load print history: ${(e as Error).message}`, 'error');
    } finally {
      setLoadingHistory(false);
    }
  }, [showNotification]);
  useEffect(() => { void reloadHistory(); }, [reloadHistory]);

  const statusById = useMemo(() => {
    const m = new Map<string, PrintStatus>();
    for (const r of rows) m.set(r.attendee.id, printStatusOf(r, history.get(r.attendee.id)?.[0]));
    return m;
  }, [rows, history]);

  const counts = useMemo(() => {
    const c = { new: 0, changed: 0, printed: 0 };
    for (const s of statusById.values()) c[s] += 1;
    return c;
  }, [statusById]);

  const categories = useMemo(() => [...new Set(rows.map(r => r.fields.badgeCategory))].sort(), [rows]);
  const lastExport = exportsList[0];

  // ── Filtering + sorting ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const batchId = batchFilter === 'all' ? null : Number(batchFilter);
    const list = rows.filter(r => {
      const a = r.attendee;
      const status = statusById.get(a.id) ?? 'new';
      if (statusFilter === 'to-print' && status === 'printed') return false;
      if (statusFilter !== 'all' && statusFilter !== 'to-print' && status !== statusFilter) return false;
      if (batchId != null && !(history.get(a.id) ?? []).some(p => p.exportId === batchId)) return false;
      if (categoryFilter !== 'all' && r.fields.badgeCategory !== categoryFilter) return false;
      if (regStatusFilter !== 'all' && r.fields.regStatus !== regStatusFilter) return false;
      if (regionFilter === 'unknown' && !r.countryUnknown) return false;
      if ((regionFilter === 'IND' || regionFilter === 'INT') && r.region !== regionFilter) return false;
      if (dayFilter !== 'all') {
        const days = daysAttendingOf(a);
        if (days.length > 0 && !days.includes(dayFilter)) return false;
      }
      const reg = (a.registeredAt ?? '').slice(0, 10);
      if (fromDate && reg < fromDate) return false;
      if (toDate && reg > toDate) return false;
      if (q) {
        const hay = [r.fields.name, r.fields.email, r.fields.regId, r.fields.mobile, r.fields.institute].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byReg = (x: BadgeRow) => x.attendee.registeredAt ?? '';
    list.sort((x, y) => {
      switch (sortKey) {
        case 'oldest': return byReg(x).localeCompare(byReg(y));
        case 'regid': return x.fields.regId.localeCompare(y.fields.regId, undefined, { numeric: true });
        case 'name': return x.fields.name.localeCompare(y.fields.name);
        default: return byReg(y).localeCompare(byReg(x));
      }
    });
    return list;
  }, [rows, statusById, history, search, statusFilter, batchFilter, categoryFilter, regStatusFilter, regionFilter, dayFilter, fromDate, toDate, sortKey]);

  const toPrint = useMemo(() => filtered.filter(r => statusById.get(r.attendee.id) !== 'printed'), [filtered, statusById]);

  // Group by registration date when sorted by date.
  const groups = useMemo(() => {
    if (sortKey !== 'newest' && sortKey !== 'oldest') return [{ key: 'all', label: '', rows: filtered }];
    const out: Array<{ key: string; label: string; rows: BadgeRow[] }> = [];
    for (const r of filtered) {
      const key = (r.attendee.registeredAt ?? '').slice(0, 10) || 'unknown';
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(r);
      else out.push({ key, label: key === 'unknown' ? 'Date unknown' : fmtDate(r.attendee.registeredAt!), rows: [r] });
    }
    return out;
  }, [filtered, sortKey]);

  const activeFilters = {
    search, status: statusFilter, batch: batchFilter, category: categoryFilter, regStatus: regStatusFilter,
    region: regionFilter, day: dayFilter, from: fromDate, to: toDate,
  };

  // ── Export ──
  const doExport = async (which: BadgeRow[], kind: 'to-print' | 'view') => {
    if (which.length === 0) {
      showNotification('Nothing to export with the current filters.', 'warning');
      return;
    }
    if (which.some(r => !r.fields.regId)) {
      showNotification('Some registration IDs are still being assigned — try again in a moment.', 'warning');
      return;
    }
    setBusy('export');
    try {
      const record = kind === 'to-print' || markPrinted;
      let batchNo: number | null = null;
      if (record) {
        batchNo = await recordPrintExport(
          kind === 'to-print' ? 'Badges to print' : 'Exported view',
          { kind, ...activeFilters },
          which.map(r => ({ attendee_id: r.attendee.id, fingerprint: r.fingerprint, snapshot: r.fields as unknown as Record<string, unknown> })),
        );
      }
      const stamp = format(new Date(), 'yyyyMMdd_HHmm');
      await downloadBadgeWorkbook(
        which.map(r => r.fields),
        batchNo ? `GANSID26_badges_batch${batchNo}_${stamp}.xlsx` : `GANSID26_badges_${stamp}.xlsx`,
      );
      showNotification(
        batchNo ? `Exported ${which.length} badges as batch #${batchNo}.` : `Exported ${which.length} badges (not recorded as printed).`,
        'success',
      );
      if (record) await reloadHistory();
    } catch (e) {
      showNotification(`Export failed: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const redownloadBatch = async (exportId: number) => {
    setBusy('redownload');
    try {
      const snaps = await loadExportSnapshot(exportId);
      const fields = snaps
        .map(s => s as unknown as BadgeFields)
        .sort((x, y) => (x.regId ?? '').localeCompare(y.regId ?? '', undefined, { numeric: true }));
      await downloadBadgeWorkbook(fields, `GANSID26_badges_batch${exportId}_copy.xlsx`);
    } catch (e) {
      showNotification(`Could not re-download batch #${exportId}: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const resetFilters = () => {
    setSearch(''); setStatusFilter('all'); setBatchFilter('all'); setCategoryFilter('all');
    setRegStatusFilter('all'); setRegionFilter('all'); setDayFilter('all'); setFromDate(''); setToDate('');
  };

  const selectCls = 'bg-white/80 border border-slate-200 rounded-md px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="space-y-4" data-testid="badge-printing-tab">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => setStatusFilter('new')} className="text-left p-3 rounded-xl border bg-white/70 hover:border-sky-300">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Not printed</div>
          <div className="text-2xl font-bold text-sky-700">{counts.new}</div>
        </button>
        <button type="button" onClick={() => setStatusFilter('changed')} className="text-left p-3 rounded-xl border bg-white/70 hover:border-amber-300">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Changed since printed</div>
          <div className="text-2xl font-bold text-amber-700">{counts.changed}</div>
        </button>
        <button type="button" onClick={() => setStatusFilter('printed')} className="text-left p-3 rounded-xl border bg-white/70 hover:border-emerald-300">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Printed</div>
          <div className="text-2xl font-bold text-emerald-700">{counts.printed}</div>
        </button>
        <div className="p-3 rounded-xl border bg-white/70">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last export</div>
          {loadingHistory ? (
            <div className="text-sm text-slate-400 mt-1">Loading…</div>
          ) : lastExport ? (
            <div className="text-sm text-slate-700 mt-0.5" data-testid="last-export">
              <span className="font-bold">Batch #{lastExport.id}</span> · {lastExport.rowCount} badges
              <div className="text-xs text-slate-500">{fmtDateTime(lastExport.createdAt)}{lastExport.createdByEmail ? ` · ${lastExport.createdByEmail}` : ''}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-400 mt-1">No batches exported yet</div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white/60 border border-white/60 text-xs">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name, email, Reg. ID, mobile…"
            className="pl-7 pr-2 py-1 rounded-md border border-slate-200 bg-white/80 text-xs w-56 outline-none focus:ring-2 focus:ring-indigo-400"
            aria-label="Search badges"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} className={selectCls} aria-label="Print status" data-testid="badge-status-filter">
          <option value="all">All print statuses</option>
          <option value="to-print">Needs printing (new + changed)</option>
          <option value="new">{PRINT_STATUS_LABELS.new}</option>
          <option value="changed">{PRINT_STATUS_LABELS.changed}</option>
          <option value="printed">{PRINT_STATUS_LABELS.printed}</option>
        </select>
        <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)} className={selectCls} aria-label="Batch">
          <option value="all">All batches</option>
          {exportsList.map(b => <option key={b.id} value={String(b.id)}>Batch #{b.id} · {fmtDate(b.createdAt)} ({b.rowCount})</option>)}
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={selectCls} aria-label="Badge category">
          <option value="all">All badge categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={regStatusFilter} onChange={e => setRegStatusFilter(e.target.value)} className={selectCls} aria-label="Registration status">
          <option value="all">Paid + complimentary + pending</option>
          <option value="Paid">Paid</option>
          <option value="Complimentary">Complimentary</option>
          <option value="Pending">Pending</option>
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value as typeof regionFilter)} className={selectCls} aria-label="Region">
          <option value="all">India + international</option>
          <option value="IND">India (GSD_IND)</option>
          <option value="INT">International (GSD_INT)</option>
          <option value="unknown">Country not on file</option>
        </select>
        <select value={dayFilter} onChange={e => setDayFilter(e.target.value)} className={selectCls} aria-label="Day attending">
          <option value="all">All days</option>
          {CONGRESS_DAYS.map(d => <option key={d} value={d}>{shortDayLabel(d)}</option>)}
        </select>
        <label className="flex items-center gap-1 text-slate-500">
          Registered
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={selectCls} aria-label="Registered from" />
          –
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={selectCls} aria-label="Registered to" />
        </label>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className={selectCls} aria-label="Sort">
          <option value="newest">Newest registrations first</option>
          <option value="oldest">Oldest registrations first</option>
          <option value="regid">Reg. ID</option>
          <option value="name">Name</option>
        </select>
        <button type="button" onClick={resetFilters} className="ml-auto text-slate-500 hover:text-indigo-600 underline decoration-dotted">Reset</button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => doExport(toPrint, 'to-print')}
          disabled={busy !== null || toPrint.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          title="Download every badge in the current view that has not been printed or has changed since, and record it as a new batch"
          data-testid="export-to-print"
        >
          {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
          Export to print ({toPrint.length})
        </button>
        <button
          type="button"
          onClick={() => doExport(filtered, 'view')}
          disabled={busy !== null || filtered.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          data-testid="export-view"
        >
          <Download className="w-4 h-4" /> Export this view ({filtered.length})
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={markPrinted} onChange={e => setMarkPrinted(e.target.checked)} />
          Record "Export this view" as a printed batch
        </label>
        {exportsList.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 ml-auto">
            <History className="w-3.5 h-3.5" />
            <select
              defaultValue=""
              onChange={e => { if (e.target.value) { void redownloadBatch(Number(e.target.value)); e.target.value = ''; } }}
              className={selectCls}
              aria-label="Re-download a batch"
              disabled={busy !== null}
            >
              <option value="">Re-download a batch…</option>
              {exportsList.map(b => <option key={b.id} value={b.id}>Batch #{b.id} · {fmtDateTime(b.createdAt)} · {b.rowCount}</option>)}
            </select>
          </div>
        )}
        <button type="button" onClick={() => { void reloadHistory(); onRefresh?.(); }} className="p-2 rounded-md text-slate-500 hover:text-indigo-600" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${busy === 'codes' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/60">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Print status</th>
              <th className="px-3 py-2">Reg. ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Badge category</th>
              <th className="px-3 py-2">Reg. category</th>
              <th className="px-3 py-2" title="Lunch / dinner per day">Meals (L1 D1 L2 D2 L3)</th>
              <th className="px-3 py-2">Kit / Cert.</th>
              <th className="px-3 py-2">City / Country</th>
              <th className="px-3 py-2">Mobile</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Reg. status</th>
              <th className="px-3 py-2">Registered</th>
              <th className="px-3 py-2">Last printed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400">No badges match these filters.</td></tr>
            )}
            {groups.map(g => (
              <React.Fragment key={g.key}>
                {g.label && (
                  <tr className="bg-indigo-50/60">
                    <td colSpan={13} className="px-3 py-1.5 text-[11px] font-bold text-indigo-800">
                      {g.label} <span className="font-medium text-indigo-500">· {g.rows.length} registration{g.rows.length === 1 ? '' : 's'}</span>
                    </td>
                  </tr>
                )}
                {g.rows.map(r => {
                  const status = statusById.get(r.attendee.id) ?? 'new';
                  const last = history.get(r.attendee.id)?.[0];
                  const f = r.fields;
                  return (
                    <tr key={r.attendee.id} className="border-t border-slate-100 hover:bg-white" data-testid="badge-row">
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}>
                          {PRINT_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{f.regId || <span className="text-slate-300">assigning…</span>}</td>
                      <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">{f.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{f.badgeCategory}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={f.regCategory}>{f.regCategory}</td>
                      <td className="px-3 py-2 font-mono tracking-widest whitespace-nowrap" title={`Lunch 1 ${f.lunch1} · Dinner 1 ${f.dinner1} · Lunch 2 ${f.lunch2} · Dinner 2 ${f.dinner2} · Lunch 3 ${f.lunch3}`}>
                        {[f.lunch1, f.dinner1, f.lunch2, f.dinner2, f.lunch3].map((m, i) => (
                          <span key={i} className={m === 'Yes' ? 'text-emerald-600' : 'text-slate-300'}>{m === 'Yes' ? '●' : '○'}</span>
                        ))}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{f.kit} / {f.certificate}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {f.cityCountry || '—'}
                        {r.countryUnknown && (
                          <span title="No country on file — Reg. ID assumed India" className="ml-1 inline-flex align-middle text-amber-600"><AlertTriangle className="w-3 h-3" /></span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{f.mobile || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{f.email}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{f.regStatus}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(r.attendee.registeredAt ?? '')}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {last ? <>#{last.exportId} · {fmtDate(last.createdAt)}</> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">
        Showing {filtered.length} of {rows.length} badges. Meals and kit follow each person's days attending; days on file:{' '}
        {CONGRESS_DAYS.map(shortDayLabel).join(', ')}.
      </div>
    </div>
  );
}
