import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Search, RefreshCw, CheckCircle2, Clock, Circle, Eye, MousePointerClick } from 'lucide-react';
import { getPortalUsers, type PortalUser } from '../../services/storageService';
import { getLatestEmailSendPerRecipient, type EmailSend } from '../../services/emailSendsService';
import type { AppSettings, Form } from '../../types';
import SendUserEmailModal from './SendUserEmailModal';

const TEMPLATE_SHORT_LABELS: Record<string, string> = {
  reminder: 'Reminder',
  invitation: 'Invitation',
  blank: 'Custom',
  custom: 'Custom',
};

interface Props {
  settings: AppSettings;
  forms: Form[];
}

type FilterKey = 'all' | 'not_started' | 'in_progress' | 'has_ticket';

function timeAgo(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export default function SignupsTab({ settings, forms }: Props) {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [emailSendsByEmail, setEmailSendsByEmail] = useState<Map<string, EmailSend>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<PortalUser | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, sendsMap] = await Promise.all([
        getPortalUsers(),
        getLatestEmailSendPerRecipient(),
      ]);
      setUsers(rows);
      setEmailSendsByEmail(sendsMap);
    } finally {
      setLoading(false);
    }
  };

  const reloadEmailSends = async () => {
    const sendsMap = await getLatestEmailSendPerRecipient();
    setEmailSendsByEmail(sendsMap);
  };

  useEffect(() => { load(); }, []);

  // Enrich draft.totalSteps from form settings so the progress pill can say "2 of 5"
  // instead of just "step 2".
  const stepsByFormId = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of forms) {
      const steps = (f.settings as any)?.steps;
      if (Array.isArray(steps)) map.set(f.id, steps.length);
    }
    return map;
  }, [forms]);

  const rows = useMemo(() => {
    const filtered = users.filter(u => {
      if (search) {
        const s = search.toLowerCase();
        const match = (u.email || '').toLowerCase().includes(s)
          || (u.fullName || '').toLowerCase().includes(s);
        if (!match) return false;
      }
      if (filter === 'has_ticket') return u.hasPaidTicket;
      if (filter === 'in_progress') return !u.hasPaidTicket && !!u.draft;
      if (filter === 'not_started') return !u.hasPaidTicket && !u.draft;
      return true;
    });
    filtered.sort((a, b) =>
      new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
    return filtered;
  }, [users, search, filter]);

  const counts = useMemo(() => ({
    all: users.length,
    has_ticket: users.filter(u => u.hasPaidTicket).length,
    in_progress: users.filter(u => !u.hasPaidTicket && u.draft).length,
    not_started: users.filter(u => !u.hasPaidTicket && !u.draft).length,
  }), [users]);

  const statusBadge = (u: PortalUser) => {
    if (u.hasPaidTicket) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          Registered
        </span>
      );
    }
    if (u.draft) {
      const total = stepsByFormId.get(u.draft.formId) ?? u.draft.totalSteps;
      const label = total
        ? `In progress — step ${u.draft.currentIndex + 1} of ${total}`
        : `In progress — step ${u.draft.currentIndex + 1}`;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          {label}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-50 text-slate-600 border border-slate-200">
        <Circle className="w-3 h-3" />
        Not started
      </span>
    );
  };

  return (
    <div className="space-y-3">
      {/* Filter + search bar */}
      <div className="flex flex-wrap items-center gap-2 bg-white/60 backdrop-blur-sm p-3 rounded-lg border border-white/40">
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-gray-200">
          {([
            ['all', `All (${counts.all})`],
            ['not_started', `Not started (${counts.not_started})`],
            ['in_progress', `In progress (${counts.in_progress})`],
            ['has_ticket', `Registered (${counts.has_ticket})`],
          ] as Array<[FilterKey, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition ${filter === key ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name or email…"
            className="pl-9 pr-4 py-2 border border-white/40 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full bg-white/80"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Name</th>
              <th className="text-left px-4 py-2 font-semibold">Email</th>
              <th className="text-left px-4 py-2 font-semibold">Role</th>
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Signed up</th>
              <th className="text-left px-4 py-2 font-semibold">Last activity</th>
              <th className="text-left px-4 py-2 font-semibold">Last email</th>
              <th className="text-right px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Loading users…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No users match this filter.</td></tr>
            )}
            {!loading && rows.map(u => {
              const lastEmail = emailSendsByEmail.get(u.email.toLowerCase());
              return (
                <tr key={u.userId} className="hover:bg-indigo-50/30">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{u.fullName || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2.5 text-gray-700">{u.email}</td>
                  <td className="px-4 py-2.5 text-gray-600 capitalize">{u.role}</td>
                  <td className="px-4 py-2.5">{statusBadge(u)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs" title={u.signupDate}>{timeAgo(u.signupDate)}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs" title={u.lastActivityAt}>{timeAgo(u.lastActivityAt)}</td>
                  <td className="px-4 py-2.5">
                    {lastEmail ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-gradient-to-r from-[#ba0028]/10 to-[#E0243C]/10 text-[#ba0028] border border-[#ba0028]/20"
                            title={lastEmail.subject}
                          >
                            {TEMPLATE_SHORT_LABELS[lastEmail.templateKey || 'custom'] || lastEmail.templateKey}
                          </span>
                          {lastEmail.openedAt && (
                            <span title={`Opened ${new Date(lastEmail.openedAt).toLocaleString()}`}>
                              <Eye className="w-3 h-3 text-emerald-600" />
                            </span>
                          )}
                          {lastEmail.clickCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-700" title={`${lastEmail.clickCount} click${lastEmail.clickCount > 1 ? 's' : ''}`}>
                              <MousePointerClick className="w-3 h-3" />{lastEmail.clickCount}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500" title={lastEmail.sentAt}>
                          {timeAgo(lastEmail.sentAt)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setSelected(u)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 transition"
                      title="Send an email to this user"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Email
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <SendUserEmailModal
          user={selected}
          settings={settings}
          forms={forms}
          onClose={() => setSelected(null)}
          onSent={reloadEmailSends}
        />
      )}
    </div>
  );
}
