import React, { useState, useMemo, useEffect } from 'react';
import { Attendee, AppSettings } from '../../types';
import { Search, ChevronDown, ChevronRight, ChevronsDown, ChevronsRight, Copy, CheckCircle } from 'lucide-react';
import SponsorDetailModal from './SponsorDetailModal';
import ChequeReceivedModal from './ChequeReceivedModal';
import { getBoothType } from '../../config/formTemplates/boothTypes';
import { supabase } from '../../services/supabaseClient';
import { delegateStatus, isPlaceholderEmail } from '../../utils/registrationKind';
import { useNotifications } from '../NotificationSystem';

interface Props {
  sponsors: Attendee[];
  settings: AppSettings;
  onChanged: () => void | Promise<void>;
}

/** The fields a delegate line needs — fetched once for every sponsor. */
interface DelegateRow {
  id: string;
  primaryAttendeeId: string;
  formId: string | null;
  name: string;
  email: string;
  guestType: string | null;
  isPaidExtra: boolean;
  checkedInAt: string | null;
  claimed: boolean;
}

const COLUMN_COUNT = 10;

export const SponsorsTable: React.FC<Props> = ({ sponsors, settings, onChanged }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'paypal' | 'cheque'>('all');
  const [detailFor, setDetailFor] = useState<Attendee | null>(null);
  const [chequeFor, setChequeFor] = useState<Attendee | null>(null);
  const [delegatesByOrg, setDelegatesByOrg] = useState<Record<string, DelegateRow[]>>({});
  // Delegates are listed under their organisation by default — seeing who a
  // sponsor has registered used to mean opening each one's modal. The set
  // holds what the admin has folded away.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { showNotification } = useNotifications();

  // Every sponsor's delegates in one round-trip. Claimed/unclaimed uses the
  // shared rule (utils/registrationKind) — the combined-form `staff-pending`
  // states used to count as claimed here, so four unclaimed seats read
  // "4/4 claimed".
  useEffect(() => {
    if (sponsors.length === 0) { setDelegatesByOrg({}); return; }
    let cancelled = false;
    (async () => {
      const ids = sponsors.map(s => s.id);
      const { data } = await supabase
        .from('attendees')
        .select('id,primary_attendee_id,form_id,name,email,guest_type,is_paid_extra,checked_in_at')
        .in('primary_attendee_id', ids)
        .eq('is_primary', false)
        .order('registered_at', { ascending: true });
      if (cancelled) return;
      const next: Record<string, DelegateRow[]> = {};
      for (const row of (data || []) as Array<{
        id: string; primary_attendee_id: string | null; form_id: string | null; name: string | null; email: string | null;
        guest_type: string | null; is_paid_extra: boolean | null; checked_in_at: string | null;
      }>) {
        const pid = row.primary_attendee_id;
        if (!pid) continue;
        (next[pid] ??= []).push({
          id: row.id,
          primaryAttendeeId: pid,
          formId: row.form_id,
          name: row.name || 'Unnamed seat',
          email: row.email || '',
          guestType: row.guest_type,
          isPaidExtra: !!row.is_paid_extra,
          checkedInAt: row.checked_in_at,
          claimed: delegateStatus({ guestType: row.guest_type, name: row.name }) === 'registered',
        });
      }
      setDelegatesByOrg(next);
    })();
    return () => { cancelled = true; };
  }, [sponsors]);

  const toggleOrg = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const copyClaimLink = (org: Attendee, d: DelegateRow) => {
    const url = `${window.location.origin}/#/form/${d.formId || org.formId}?ref=${d.id}`;
    navigator.clipboard.writeText(url);
    showNotification(`Registration link for ${d.name} copied`, 'success');
  };

  const filtered = useMemo(() => sponsors.filter(s => {
    if (statusFilter !== 'all' && s.paymentStatus !== statusFilter) return false;
    if (methodFilter !== 'all' && s.paymentMethod !== methodFilter && !(methodFilter === 'paypal' && s.paymentMethod === 'card')) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.companyInfo?.orgName || s.name} ${s.companyInfo?.contactName || ''} ${s.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [sponsors, search, statusFilter, methodFilter]);

  const orgsWithDelegates = filtered.filter(s => (delegatesByOrg[s.id]?.length ?? 0) > 0).map(s => s.id);
  const allCollapsed = orgsWithDelegates.length > 0 && orgsWithDelegates.every(id => collapsed.has(id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2 bg-white flex-1 min-w-64">
          <Search className="w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search org, contact, email" className="outline-none flex-1" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="border border-slate-300 rounded-lg px-3 py-2 bg-white">
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value as any)} className="border border-slate-300 rounded-lg px-3 py-2 bg-white">
          <option value="all">All methods</option>
          <option value="paypal">Card / PayPal</option>
          <option value="cheque">Cheque</option>
        </select>
        {orgsWithDelegates.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(orgsWithDelegates))}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            data-testid="sponsors-toggle-all-delegates"
          >
            {allCollapsed ? <ChevronsDown className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
            {allCollapsed ? 'Show delegates' : 'Hide delegates'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-3">Organization</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Guests</th>
              <th className="text-left px-4 py-3">Extras</th>
              <th className="text-left px-4 py-3">Submitted</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(s => {
              const delegates = delegatesByOrg[s.id] ?? [];
              const claimed = delegates.filter(d => d.claimed).length;
              const paidExtras = delegates.filter(d => d.isPaidExtra).length;
              const open = delegates.length > 0 && !collapsed.has(s.id);
              const orgName = s.companyInfo?.orgName || s.name;
              return (
              <React.Fragment key={s.id}>
              <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailFor(s)} data-testid="sponsor-row">
                <td className="px-4 py-3 font-semibold">
                  <div className="flex items-center gap-1.5">
                    {delegates.length > 0 ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); toggleOrg(s.id); }}
                        className="p-0.5 rounded hover:bg-slate-200 flex-shrink-0"
                        aria-expanded={open}
                        aria-label={`${open ? 'Hide' : 'Show'} ${delegates.length} delegate${delegates.length === 1 ? '' : 's'} of ${orgName}`}
                        data-testid="sponsor-toggle-delegates"
                      >
                        {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      </button>
                    ) : (
                      <span className="w-5 flex-shrink-0" aria-hidden="true" />
                    )}
                    {orgName}
                  </div>
                </td>
                <td className="px-4 py-3">{s.companyInfo?.contactName || '—'}<div className="text-xs text-slate-500">{s.email}</div></td>
                <td className="px-4 py-3">
                  <ItemBadges items={s.sponsorItems || []} />
                  {s.exhibitorBoothType && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Booth: <span className="font-medium text-slate-700">{getBoothType(s.exhibitorBoothType)?.label ?? s.exhibitorBoothType}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold">{s.paymentAmount || '—'}</td>
                <td className="px-4 py-3 capitalize">
                  {s.paymentMethod === 'cheque' ? 'Cheque'
                    : s.paymentMethod === 'external' ? 'External'
                    : 'PayPal'}
                </td>
                <td className="px-4 py-3"><StatusBadge status={s.paymentStatus} /></td>
                <td className="px-4 py-3 text-slate-600">
                  {(() => {
                    if (delegates.length === 0) return <span className="text-slate-300">—</span>;
                    const pct = Math.round((claimed / delegates.length) * 100);
                    const color = claimed === delegates.length ? 'bg-emerald-100 text-emerald-700'
                      : claimed === 0 ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700';
                    return (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`} title={`${pct}% claimed`}>
                        {claimed}/{delegates.length} claimed
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  {paidExtras === 0 ? <span className="text-slate-300">—</span> : (
                    <span
                      className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                      title={`${paidExtras} additional booth staff paid by card ($${paidExtras * 50} USD)`}
                    >
                      +{paidExtras} paid
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(s.registeredAt).toLocaleDateString()}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setDetailFor(s)} className="text-indigo-600 hover:underline text-xs mr-2">View</button>
                  {s.paymentStatus === 'pending' && (
                    <button onClick={() => setChequeFor(s)} className="text-emerald-600 hover:underline text-xs">Mark Paid</button>
                  )}
                </td>
              </tr>
              {open && (
                <tr className="bg-slate-50/70" data-testid="sponsor-delegates">
                  <td colSpan={COLUMN_COUNT} className="px-4 pb-3 pt-1">
                    <ul className="ml-6 border-l-2 border-indigo-100 divide-y divide-slate-100 bg-white rounded-r-lg">
                      {delegates.map(d => {
                        const noInbox = !d.email || isPlaceholderEmail(d.email);
                        return (
                          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs" data-testid="sponsor-delegate">
                            <span className="font-semibold text-slate-800 min-w-[160px]">{d.name}</span>
                            <span className="text-slate-500 min-w-[180px] truncate" title={noInbox ? 'No address yet — the seat has not been claimed' : d.email}>
                              {noInbox ? '—' : d.email}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full font-semibold ${d.claimed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                              {d.claimed ? 'Registered' : 'Awaiting their details'}
                            </span>
                            {d.isPaidExtra && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold" title="Paid additional booth staff">
                                Paid extra
                              </span>
                            )}
                            {d.checkedInAt && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                <CheckCircle className="w-3.5 h-3.5" /> Checked in
                              </span>
                            )}
                            {!d.claimed && (
                              <button
                                type="button"
                                onClick={() => copyClaimLink(s, d)}
                                className="ml-auto inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                                title="Copy the link this person uses to fill in their own details"
                              >
                                <Copy className="w-3.5 h-3.5" /> Copy link
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              )}
              </React.Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={COLUMN_COUNT} className="text-center p-12 text-slate-400">No sponsors yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailFor && <SponsorDetailModal attendee={detailFor} settings={settings} onClose={() => setDetailFor(null)} onChanged={onChanged} onMarkCheque={() => { setChequeFor(detailFor); setDetailFor(null); }} />}
      {chequeFor && <ChequeReceivedModal attendee={chequeFor} settings={settings} onClose={() => setChequeFor(null)} onConfirmed={async () => { setChequeFor(null); await onChanged(); }} />}
    </>
  );
};

const ItemBadges: React.FC<{ items: Attendee['sponsorItems'] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1">
    {(items || []).map(i => {
      const color = i.type === 'package' ? 'bg-red-100 text-red-700' : i.type === 'scholarship' ? 'bg-emerald-100 text-emerald-700' : i.type === 'ad' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700';
      return (
        <span key={i.key} className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
          {i.qty > 1 && `×${i.qty} `}{i.label}
        </span>
      );
    })}
  </div>
);

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const color = status === 'paid' ? 'bg-emerald-100 text-emerald-700' : status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{status || 'unknown'}</span>;
};

export default SponsorsTable;
