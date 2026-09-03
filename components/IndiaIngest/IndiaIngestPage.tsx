import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Circle, Copy,
  Search, ChevronDown, Mail, Inbox, X, Send, EyeOff, RotateCcw, Activity, ExternalLink,
} from 'lucide-react';
import { useNotifications } from '../NotificationSystem';
import { timeAgo } from '../../utils/timeAgo';
import {
  getTscsEmails, getTscsPollRuns, runTscsPoll, ingestTscsRegistration, setTscsEmailStatus, getTscsEmailBody,
  type TscsEmailRow, type TscsEmailStatus, type TscsPollRun,
} from '../../services/tscsIngestService';

const STATUS_META: Record<TscsEmailStatus, { cls: string; icon: React.ReactNode; label: string }> = {
  'ingested':     { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" />,  label: 'Registered' },
  'needs-review': { cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <AlertTriangle className="w-3 h-3" />, label: 'Needs review' },
  'duplicate':    { cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',    icon: <Copy className="w-3 h-3" />,          label: 'Duplicate' },
  'error':        { cls: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="w-3 h-3" />,       label: 'Error' },
  'ignored':      { cls: 'bg-slate-50 text-slate-600 border-slate-200',       icon: <Circle className="w-3 h-3" />,        label: 'Ignored' },
};

function StatusPill({ status }: { status: TscsEmailStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.error;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${m.cls}`}>
      {m.icon}{m.label}
    </span>
  );
}

/** The editable subset of a parsed registration. Deliberately the same field
 *  set the parser produces, so "fix it here" and "the parser got it right"
 *  converge on one shape. */
const EDIT_FIELDS: Array<{ key: string; label: string; placeholder?: string; wide?: boolean }> = [
  { key: 'name', label: 'Full name', placeholder: 'Jane Doe' },
  { key: 'email', label: 'Email', placeholder: 'jane@example.com' },
  { key: 'category', label: 'Registration category', placeholder: 'Physicians / Researchers', wide: true },
  { key: 'phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'institution', label: 'Institution', wide: true },
  { key: 'role', label: 'Role' },
  { key: 'payment_id', label: 'Razorpay payment ID', placeholder: 'pay_XXXXXXXXXXXX' },
  { key: 'total_inr', label: 'Amount paid (₹)', placeholder: '2400' },
  { key: 'attending_days', label: 'Attending days', placeholder: 'Oct 23, 2026, Oct 24, 2026', wide: true },
];

const IndiaIngestPage: React.FC = () => {
  const { showNotification } = useNotifications();
  const [emails, setEmails] = useState<TscsEmailRow[]>([]);
  const [runs, setRuns] = useState<TscsPollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | TscsEmailStatus>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TscsEmailRow | null>(null);
  const [showRuns, setShowRuns] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [e, r] = await Promise.all([getTscsEmails(), getTscsPollRuns()]);
      setEmails(e);
      setRuns(r);
    } catch (err: any) {
      showNotification(`Could not load the India queue: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  // "Last checked 2m ago" must not still say 2m an hour later: this page is
  // meant to be left open, and a frozen banner recreates exactly the ambiguity
  // the run log was built to remove.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // The health reading only counts LIVE runs: a dry-run rehearsal must never
  // make a broken cron look healthy.
  const lastLiveRun = useMemo(() => runs.find(r => !r.dryRun) ?? null, [runs]);
  const lastGoodRun = useMemo(() => runs.find(r => r.ok && !r.dryRun) ?? null, [runs]);
  const minutesSinceGood = lastGoodRun
    ? Math.floor((Date.now() - new Date(lastGoodRun.startedAt).getTime()) / 60000)
    : null;
  // GitHub's scheduled workflows are best-effort, NOT punctual. This poller is
  // configured for every 10 minutes, but the observed cadence in production is
  // one run every 2-5 hours — GitHub delays and drops scheduled runs under
  // load. 6h is therefore the honest threshold: past the worst gap actually
  // seen, so amber means something is wrong rather than "GitHub is busy".
  // "Check mail now" is the escape hatch when a registration is waiting.
  const STALE_AFTER_MIN = 6 * 60;
  const stale = minutesSinceGood === null || minutesSinceGood > STALE_AFTER_MIN;
  // Past the nominal cadence but well inside GitHub's normal drift.
  const overdue = !stale && minutesSinceGood !== null && minutesSinceGood > 60;
  const lastRunFailed = !!lastLiveRun && !lastLiveRun.ok;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: emails.length };
    for (const e of emails) c[e.status] = (c[e.status] || 0) + 1;
    return c;
  }, [emails]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emails.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [e.subject, e.fromAddr, e.messageId, e.parsed?.name, e.parsed?.email, e.parsed?.payment_id]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [emails, statusFilter, search]);

  const checkMailNow = async () => {
    setPolling(true);
    try {
      const res = await runTscsPoll();
      const n = res.processed ?? 0;
      showNotification(
        n === 0 ? 'Mailbox checked — nothing new.' : `Mailbox checked — ${n} message${n === 1 ? '' : 's'} processed.`,
        'success',
      );
      await load(true);
    } catch (err: any) {
      showNotification(`Mail check failed: ${err?.message || 'unknown error'}`, 'error');
      await load(true); // the failed run was still logged — show it
    } finally {
      setPolling(false);
    }
  };

  const needsReviewCount = counts['needs-review'] || 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap gap-4 justify-between items-start bg-gradient-to-r from-blue-800 to-indigo-900 p-8 rounded-3xl shadow-2xl shadow-indigo-900/20 text-white relative overflow-hidden border border-indigo-700">
        <div className="absolute -right-10 -top-16 opacity-10 transform rotate-12 scale-150 pointer-events-none">
          <Inbox strokeWidth={1.5} className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 border border-white/20">
            INDIA · TSCS
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight mb-2">India Registrations</h2>
          <p className="text-indigo-100 text-lg max-w-xl">
            Every registration TSCS collects in ₹ arrives here as a confirmation email, and is
            turned into a ticketed registration automatically. This page is where you watch that
            happen — and step in when a message needs a human.
          </p>
        </div>
        <button
          onClick={checkMailNow}
          disabled={polling}
          className="bg-white text-indigo-900 px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-indigo-50 flex items-center gap-2 relative z-10 disabled:opacity-60"
        >
          {polling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {polling ? 'Checking…' : 'Check mail now'}
        </button>
      </header>

      {/* Health — the answer to "is this thing running?" */}
      <div
        className={`mb-4 px-4 py-3 rounded-xl border flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${
          lastRunFailed
            ? 'bg-red-50 border-red-200 text-red-800'
            : stale
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}
      >
        <Activity className="w-4 h-4 shrink-0" />
        {loading ? (
          <span>Checking pipeline health…</span>
        ) : lastRunFailed ? (
          <>
            <span className="font-semibold">The last mail check failed.</span>
            <span className="opacity-90">{lastLiveRun?.error || 'No reason recorded.'}</span>
            <span className="opacity-70" title={lastLiveRun?.startedAt}>({timeAgo(lastLiveRun?.startedAt)})</span>
          </>
        ) : lastGoodRun ? (
          <>
            <span className="font-semibold">
              {stale ? 'No successful mail check recently.' : 'Pipeline healthy.'}
            </span>
            <span title={lastGoodRun.startedAt}>
              Last checked {timeAgo(lastGoodRun.startedAt)} via {lastGoodRun.source}
              {lastGoodRun.triggeredBy ? ` (${lastGoodRun.triggeredBy})` : ''}.
            </span>
            <span className="opacity-80">
              {lastGoodRun.processed === 0
                ? 'Nothing new that run.'
                : `${lastGoodRun.processed} message${lastGoodRun.processed === 1 ? '' : 's'} handled.`}
            </span>
            {(overdue || stale) && (
              <span className="opacity-80">
                Scheduled checks are best-effort and often run only every few hours — use
                <strong> Check mail now</strong> if someone is waiting on a ticket.
              </span>
            )}
          </>
        ) : (
          <span className="font-semibold">No mail check has been recorded yet.</span>
        )}
        <button
          onClick={() => setShowRuns(v => !v)}
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold underline decoration-dotted hover:opacity-70"
        >
          {showRuns ? 'Hide' : 'Show'} recent checks <ChevronDown className={`w-3 h-3 transition-transform ${showRuns ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showRuns && (
        <div className="mb-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">When</th>
                <th className="text-left px-4 py-2 font-semibold">Source</th>
                <th className="text-left px-4 py-2 font-semibold">Result</th>
                <th className="text-left px-4 py-2 font-semibold">Messages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No mail checks recorded yet.</td></tr>
              )}
              {runs.map(r => (
                <tr key={r.id} className="hover:bg-indigo-50/30">
                  <td className="px-4 py-2 text-gray-700" title={r.startedAt}>{timeAgo(r.startedAt)}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {r.source}{r.dryRun ? ' · dry run' : ''}
                    {r.triggeredBy ? <span className="text-gray-400"> · {r.triggeredBy}</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    {r.ok
                      ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold"><CheckCircle2 className="w-3 h-3" /> OK</span>
                      : <span className="inline-flex items-center gap-1 text-red-700 text-xs font-semibold" title={r.error || ''}><XCircle className="w-3 h-3" /> Failed</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">
                    {r.processed === 0 ? <span className="text-gray-400">nothing new</span> : (
                      <>
                        {r.processed} seen
                        {r.ingested ? ` · ${r.ingested} registered` : ''}
                        {r.needsReview ? ` · ${r.needsReview} needs review` : ''}
                        {r.duplicates ? ` · ${r.duplicates} duplicate` : ''}
                        {r.ignored ? ` · ${r.ignored} ignored` : ''}
                        {r.errors ? ` · ${r.errors} error` : ''}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {needsReviewCount > 0 && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            <strong>{needsReviewCount}</strong> message{needsReviewCount === 1 ? '' : 's'} could not be read automatically.
            {' '}These are real payments with nobody registered yet — open one to finish it by hand.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-white/60 backdrop-blur-sm p-3 rounded-lg border border-white/40 mb-3">
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200 flex-wrap">
          {(['all', 'needs-review', 'ingested', 'duplicate', 'ignored', 'error'] as const).map(k => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                statusFilter === k ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {k === 'all' ? 'All' : STATUS_META[k as TscsEmailStatus].label}
              <span className="ml-1 text-gray-400">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, subject or payment ID…"
            className="pl-9 pr-4 py-2 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white/80"
          />
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Queue */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Registrant</th>
              <th className="text-left px-4 py-2 font-semibold">Subject</th>
              <th className="text-left px-4 py-2 font-semibold">Amount</th>
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Received</th>
              <th className="text-right px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400"><Loader2 className="w-6 h-6 mx-auto animate-spin text-indigo-500" /></td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <Mail className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  {emails.length === 0
                    ? 'No India registration emails have arrived yet. When TSCS confirms a payment, it lands here automatically.'
                    : 'No messages match this filter.'}
                </td>
              </tr>
            )}
            {!loading && filtered.map(e => (
              <tr key={e.id} className="hover:bg-indigo-50/30">
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{e.parsed?.name || <span className="text-gray-300">—</span>}</div>
                  <div className="text-xs text-gray-500">{e.parsed?.email || e.fromAddr || ''}</div>
                </td>
                <td className="px-4 py-2 text-gray-700 max-w-[260px] truncate" title={e.subject || ''}>
                  {e.subject || <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                  {typeof e.parsed?.total_inr === 'number'
                    ? `₹${Number(e.parsed.total_inr).toLocaleString('en-IN')}`
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2"><StatusPill status={e.status} /></td>
                <td className="px-4 py-2 text-gray-500 text-xs" title={e.receivedAt || ''}>{timeAgo(e.receivedAt) || '—'}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => setSelected(e)}
                    className="px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 rounded transition"
                  >
                    {e.status === 'needs-review' ? 'Review' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
          <div>Showing {filtered.length} of {emails.length} message{emails.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {selected && (
        <ReviewModal
          row={selected}
          onClose={() => setSelected(null)}
          onChanged={async () => { await load(true); setSelected(null); }}
        />
      )}
    </>
  );
};

const ReviewModal: React.FC<{
  row: TscsEmailRow;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}> = ({ row, onClose, onChanged }) => {
  const { showNotification } = useNotifications();
  const [form, setForm] = useState<Record<string, string>>(() => {
    const p = row.parsed || {};
    const out: Record<string, string> = {};
    for (const f of EDIT_FIELDS) {
      const v = (p as any)[f.key];
      out[f.key] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  });
  const [busy, setBusy] = useState<null | 'ingest' | 'dismiss' | 'reopen'>(null);
  // `raw` is excluded from the list query (it can be 100k chars per row), so
  // the body is fetched for just this message when it is opened.
  const [rawBody, setRawBody] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setRawLoading(true);
    getTscsEmailBody(row.messageId)
      .then(b => { if (alive) setRawBody(b); })
      .catch(() => { if (alive) setRawBody(null); })
      .finally(() => { if (alive) setRawLoading(false); });
    return () => { alive = false; };
  }, [row.messageId]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const buildRegistration = () => {
    // Start from the ORIGINAL parse so fields this form does not expose —
    // group members, the free add-on, participant count — survive a manual
    // fix. Building from the form alone would register the primary and
    // silently strand everyone else on a paid group booking.
    const reg: Record<string, unknown> = { ...(row.parsed || {}) };
    for (const f of EDIT_FIELDS) {
      const t = (form[f.key] ?? '').trim();
      if (!t) { delete reg[f.key]; continue; }
      if (f.key === 'total_inr') {
        const n = Number(t.replace(/[^\d.]/g, ''));
        // An unreadable amount must stay ABSENT rather than become ₹0.00 on a
        // paid row — the row builder's fallback is a non-monetary marker.
        if (/\d/.test(t) && Number.isFinite(n)) reg[f.key] = n;
        else delete reg[f.key];
      } else {
        reg[f.key] = t;
      }
    }
    return reg;
  };

  // A message that already produced an attendee must not be registered again:
  // editing the payment id would move the dedupe key and mint a second set of
  // rows plus a second ticket for one ₹ payment.
  const alreadyRegistered = !!row.attendeeId || row.status === 'ingested';
  const groupSize = Array.isArray(row.parsed?.group) ? row.parsed!.group.length : 0;
  const canIngest = !alreadyRegistered
    && !!form.name?.trim() && !!form.email?.trim() && !!form.category?.trim();

  const doIngest = async () => {
    if (!canIngest) return;
    setBusy('ingest');
    try {
      const res = await ingestTscsRegistration({
        registration: buildRegistration(),
        messageId: row.messageId,
      });
      showNotification(
        res.status === 'duplicate'
          ? 'Already registered — this payment was matched to an existing attendee.'
          : `Registered. ${res.createdCount ?? 1} attendee row${(res.createdCount ?? 1) === 1 ? '' : 's'} created and the ticket emailed.`,
        'success',
      );
      await onChanged();
    } catch (err: any) {
      showNotification(`Could not register: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const doStatus = async (status: 'ignored' | 'needs-review') => {
    setBusy(status === 'ignored' ? 'dismiss' : 'reopen');
    try {
      await setTscsEmailStatus({ messageId: row.messageId, status });
      showNotification(status === 'ignored' ? 'Message set aside.' : 'Message reopened for review.', 'success');
      await onChanged();
    } catch (err: any) {
      showNotification(`Could not update: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center backdrop-blur-sm bg-black/20 p-0 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Review India registration email"
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 sm:px-7 sm:py-5 border-b border-gray-100 flex justify-between items-center gap-3 bg-gradient-to-r from-blue-800 to-indigo-900 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <StatusPill status={row.status} />
              {row.isTest && <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">test</span>}
            </div>
            <h3 className="text-lg font-bold text-white truncate">{row.subject || 'India registration email'}</h3>
            <p className="text-xs text-indigo-200 truncate">
              From {row.fromAddr || 'unknown sender'}
              {row.receivedAt ? ` · ${new Date(row.receivedAt).toLocaleString()}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {row.error && (
            <div className="mx-5 mt-5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <strong>Why this needs you:</strong> {row.error}
            </div>
          )}
          {row.attendeeId && (
            <div className="mx-5 mt-5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Registered in the dashboard — attendee <code className="font-mono text-xs">{row.attendeeId}</code>.</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Registration details {row.status === 'needs-review' ? '— fill in what the email shows' : ''}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EDIT_FIELDS.map(f => (
                  <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                      {f.label}
                      {['name', 'email', 'category'].includes(f.key) && <span className="text-red-500"> *</span>}
                    </label>
                    <input
                      value={form[f.key] ?? ''}
                      onChange={e => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
              {groupSize > 0 && (
                <p className="mt-3 text-xs text-gray-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                  This booking includes <strong>{groupSize} additional participant{groupSize === 1 ? '' : 's'}</strong> read
                  from the email. They are registered along with the primary — the fields above cover the primary only.
                </p>
              )}
              {alreadyRegistered ? (
                <p className="mt-3 text-xs text-gray-500">
                  Already registered, so this cannot be submitted again. Edits here would not change the existing attendee.
                </p>
              ) : !canIngest && (
                <p className="mt-3 text-xs text-gray-500">
                  Name, email and registration category are required before this can be registered.
                </p>
              )}
            </div>

            <div className="min-w-0">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">The email as received</h4>
              <pre className="text-[11px] leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-[420px] whitespace-pre-wrap break-words text-gray-700">
                {rawLoading ? 'Loading the message…' : (rawBody || 'No body was stored for this message.')}
              </pre>
              <p className="mt-2 text-[11px] text-gray-400 font-mono break-all">{row.messageId}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2 justify-end flex-shrink-0">
          {alreadyRegistered ? null : row.status === 'ignored' ? (
            <button
              onClick={() => doStatus('needs-review')}
              disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
            >
              {busy === 'reopen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reopen
            </button>
          ) : (
            <button
              onClick={() => doStatus('ignored')}
              disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              title="Not a real registration — a partner test payment, or a duplicate you're refunding"
            >
              {busy === 'dismiss' ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />} Set aside
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Close
          </button>
          <button
            onClick={doIngest}
            disabled={!!busy || !canIngest}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
            title={alreadyRegistered ? 'This message has already been registered' : 'Create the attendee and email the ticket'}
          >
            {busy === 'ingest' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Register &amp; send ticket
          </button>
        </div>
      </div>
    </div>
  );
};

export default IndiaIngestPage;
