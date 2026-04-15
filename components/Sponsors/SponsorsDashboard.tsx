import React, { useEffect, useState } from 'react';
import { Handshake, DollarSign, Clock, Send } from 'lucide-react';
import { Attendee, SponsorProspect, AppSettings } from '../../types';
import { getSponsorAttendees, getProspects, getSettings } from '../../services/storageService';
import SponsorsTable from './SponsorsTable';
import ProspectsTab from './ProspectsTab';
import SponsorTemplatesTab from './SponsorTemplatesTab';

const TABS = [
  { key: 'all', label: 'All Sponsors' },
  { key: 'packages', label: 'Packages' },
  { key: 'scholarships', label: 'Scholarships' },
  { key: 'ads', label: 'Advertisements' },
  { key: 'booth', label: 'Booth Space' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'templates', label: 'Templates' },
] as const;

type TabKey = typeof TABS[number]['key'];

const parsePaymentAmount = (amount?: string): number => {
  if (!amount) return 0;
  // Strip non-numeric-except-dot chars (handles "12345.00 CAD (PENDING CHEQUE)" safely)
  const numeric = amount.replace(/[^0-9.]/g, '');
  const n = parseFloat(numeric);
  return Number.isFinite(n) ? n : 0;
};

export const SponsorsDashboard: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('all');
  const [sponsors, setSponsors] = useState<Attendee[]>([]);
  const [prospects, setProspects] = useState<SponsorProspect[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const reload = async () => {
    const [s, p, st] = await Promise.all([getSponsorAttendees(), getProspects(), getSettings()]);
    setSponsors(s); setProspects(p); setSettings(st);
  };
  useEffect(() => { reload(); }, []);

  const filtered = (() => {
    if (tab === 'all') return sponsors;
    if (tab === 'packages') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'package'));
    if (tab === 'scholarships') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'scholarship'));
    if (tab === 'ads') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'ad'));
    if (tab === 'booth') return sponsors.filter(a => (a.sponsorItems || []).some(i => i.type === 'booth'));
    return sponsors;
  })();

  const totalRaised = sponsors.filter(s => s.paymentStatus === 'paid').reduce((sum, s) => sum + parsePaymentAmount(s.paymentAmount), 0);
  const committed = sponsors.filter(s => s.paymentStatus === 'pending').reduce((sum, s) => sum + parsePaymentAmount(s.paymentAmount), 0);
  const confirmed = sponsors.filter(s => s.paymentStatus === 'paid').length;
  const activeProspects = prospects.filter(p => p.status === 'prospect' || p.status === 'invited').length;

  return (
    <div>
      <header className="mb-8 bg-gradient-to-r from-red-700 to-red-900 p-8 rounded-3xl shadow-2xl text-white relative overflow-hidden">
        <div className="absolute -right-10 -top-20 opacity-20 transform rotate-12 scale-150 pointer-events-none">
          <Handshake strokeWidth={1.5} className="w-64 h-64 text-white" />
        </div>
        <div className="relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3">SPONSORSHIP</div>
          <h2 className="text-4xl font-extrabold mb-2 drop-shadow-md">Sponsor Management</h2>
          <p className="text-red-100 text-lg max-w-lg">Track partnerships, manage outreach, and keep your gala's funding on target.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Raised" value={`$${totalRaised.toLocaleString()}`} color="emerald" />
        <StatCard icon={Clock} label="Committed (Pending)" value={`$${committed.toLocaleString()}`} color="amber" />
        <StatCard icon={Handshake} label="Confirmed Sponsors" value={String(confirmed)} color="indigo" />
        <StatCard icon={Send} label="Active Prospects" value={String(activeProspects)} color="blue" />
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 font-semibold text-sm whitespace-nowrap border-b-2 transition ${tab === t.key ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {settings && (
        <>
          {tab === 'templates' ? (
            <SponsorTemplatesTab settings={settings} onSaved={reload} />
          ) : tab === 'prospects' ? (
            <ProspectsTab prospects={prospects} settings={settings} onChanged={reload} />
          ) : (
            <SponsorsTable sponsors={filtered} settings={settings} onChanged={reload} />
          )}
        </>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: any; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white/80 backdrop-blur-2xl p-6 rounded-3xl shadow-xl border border-white/60">
    <div className="flex items-center justify-between mb-2">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <Icon className={`w-5 h-5 text-${color}-500`} />
    </div>
    <div className="text-3xl font-extrabold text-slate-800">{value}</div>
  </div>
);

export default SponsorsDashboard;
