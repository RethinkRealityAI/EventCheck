import React, { useState } from 'react';
import { SponsorProspect, AppSettings } from '../../types';
import { Plus, Send, Edit, Trash } from 'lucide-react';
import { deleteProspect } from '../../services/storageService';
import AddProspectModal from './AddProspectModal';
import SendInvitationModal from './SendInvitationModal';

interface Props {
  prospects: SponsorProspect[];
  settings: AppSettings;
  onChanged: () => void | Promise<void>;
}

const ProspectsTab: React.FC<Props> = ({ prospects, settings, onChanged }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorProspect | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectedProspects = prospects.filter(p => selected.has(p.id));

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg">
          <Plus className="w-4 h-4" /> Add Prospect
        </button>
        <button
          onClick={() => setSendOpen(true)}
          disabled={selected.size === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-40"
        >
          <Send className="w-4 h-4" /> Send Invitation ({selected.size})
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
            <tr>
              <th className="px-3 py-3 w-10"><input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(prospects.map(p => p.id)) : new Set())} checked={selected.size === prospects.length && prospects.length > 0} /></th>
              <th className="text-left px-4 py-3">Organization</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Last Emailed</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {prospects.map(p => (
              <tr key={p.id}>
                <td className="px-3 py-3"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                <td className="px-4 py-3 font-semibold">{p.orgName}</td>
                <td className="px-4 py-3">{p.contactName || '—'}</td>
                <td className="px-4 py-3">{p.contactEmail}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-xs text-slate-500">{p.lastEmailedAt ? new Date(p.lastEmailedAt).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setEditing(p)} className="text-indigo-600 text-xs mr-2"><Edit className="w-4 h-4 inline" /></button>
                  <button onClick={async () => { if (confirm('Delete prospect?')) { await deleteProspect(p.id); await onChanged(); } }} className="text-red-600 text-xs"><Trash className="w-4 h-4 inline" /></button>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-slate-400">No prospects yet. Add one to start outreach.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(addOpen || editing) && (
        <AddProspectModal
          prospect={editing || undefined}
          onClose={() => { setAddOpen(false); setEditing(null); }}
          onSaved={onChanged}
        />
      )}
      {sendOpen && (
        <SendInvitationModal
          prospects={selectedProspects}
          settings={settings}
          onClose={() => setSendOpen(false)}
          onSent={async () => { setSelected(new Set()); await onChanged(); }}
        />
      )}
    </>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : status === 'invited' ? 'bg-blue-100 text-blue-700' : status === 'responded' ? 'bg-amber-100 text-amber-700' : status === 'declined' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{status}</span>;
};

export default ProspectsTab;
