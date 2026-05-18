import React, { useState, useMemo, useEffect } from 'react';
import { Attendee, AppSettings } from '../../types';
import { Search } from 'lucide-react';
import SponsorDetailModal from './SponsorDetailModal';
import ChequeReceivedModal from './ChequeReceivedModal';
import { getBoothType } from '../../config/formTemplates/boothTypes';
import { supabase } from '../../services/supabaseClient';

interface Props {
  sponsors: Attendee[];
  settings: AppSettings;
  onChanged: () => void | Promise<void>;
}

interface GuestCounts {
  total: number;
  claimed: number;
  paidExtras: number;
}

export const SponsorsTable: React.FC<Props> = ({ sponsors, settings, onChanged }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | 'paypal' | 'cheque'>('all');
  const [detailFor, setDetailFor] = useState<Attendee | null>(null);
  const [chequeFor, setChequeFor] = useState<Attendee | null>(null);
  const [guestCounts, setGuestCounts] = useState<Record<string, GuestCounts>>({});

  // Aggregate guest claim counts per sponsor in a single round-trip. Uses the
  // same claimed/unclaimed rule as SponsorDetailModal — prefer guest_type,
  // fall back to the "Guest Ticket #" name heuristic for legacy rows.
  useEffect(() => {
    if (sponsors.length === 0) { setGuestCounts({}); return; }
    let cancelled = false;
    (async () => {
      const ids = sponsors.map(s => s.id);
      const { data } = await supabase
        .from('attendees')
        .select('primary_attendee_id,name,guest_type,is_paid_extra')
        .in('primary_attendee_id', ids)
        .eq('is_primary', false);
      if (cancelled) return;
      const next: Record<string, GuestCounts> = {};
      for (const row of (data || []) as Array<{ primary_attendee_id: string; name: string | null; guest_type: string | null; is_paid_extra: boolean | null }>) {
        const pid = row.primary_attendee_id;
        if (!pid) continue;
        const bucket = next[pid] ?? { total: 0, claimed: 0, paidExtras: 0 };
        bucket.total += 1;
        const claimed = row.guest_type === 'claimed'
          ? true
          : row.guest_type === 'pending-claim'
            ? false
            : !(row.name || '').includes('Guest Ticket #');
        if (claimed) bucket.claimed += 1;
        if (row.is_paid_extra) bucket.paidExtras += 1;
        next[pid] = bucket;
      }
      setGuestCounts(next);
    })();
    return () => { cancelled = true; };
  }, [sponsors]);

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

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
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
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
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
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailFor(s)}>
                <td className="px-4 py-3 font-semibold">{s.companyInfo?.orgName || s.name}</td>
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
                    const c = guestCounts[s.id];
                    if (!c || c.total === 0) return <span className="text-slate-300">—</span>;
                    const pct = Math.round((c.claimed / c.total) * 100);
                    const color = c.claimed === c.total ? 'bg-emerald-100 text-emerald-700'
                      : c.claimed === 0 ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700';
                    return (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`} title={`${pct}% claimed`}>
                        {c.claimed}/{c.total} claimed
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const extras = guestCounts[s.id]?.paidExtras ?? 0;
                    if (extras === 0) return <span className="text-slate-300">—</span>;
                    return (
                      <span
                        className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                        title={`${extras} additional booth staff paid by card ($${extras * 50} USD)`}
                      >
                        +{extras} paid
                      </span>
                    );
                  })()}
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(s.registeredAt).toLocaleDateString()}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setDetailFor(s)} className="text-indigo-600 hover:underline text-xs mr-2">View</button>
                  {s.paymentStatus === 'pending' && (
                    <button onClick={() => setChequeFor(s)} className="text-emerald-600 hover:underline text-xs">Mark Paid</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center p-12 text-slate-400">No sponsors yet.</td></tr>
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
