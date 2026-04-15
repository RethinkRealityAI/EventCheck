import React, { useState, useEffect } from 'react';
import { SponsorProspect, Form } from '../../types';
import { X } from 'lucide-react';
import { saveProspect, getForms } from '../../services/storageService';

interface Props {
  prospect?: SponsorProspect;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const AddProspectModal: React.FC<Props> = ({ prospect, onClose, onSaved }) => {
  const [p, setP] = useState<SponsorProspect>(prospect || {
    id: crypto.randomUUID(),
    orgName: '',
    contactEmail: '',
    status: 'prospect',
    emailHistory: [],
    createdAt: new Date().toISOString(),
  });
  const [forms, setForms] = useState<Form[]>([]);

  useEffect(() => { getForms().then(setForms); }, []);

  const sponsorForms = forms.filter(f => f.formType === 'sponsor');

  const handleSave = async () => {
    if (!p.orgName || !p.contactEmail) return;
    await saveProspect(p);
    await onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">{prospect ? 'Edit' : 'Add'} Prospect</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-3">
          <Field label="Organization *"><input value={p.orgName} onChange={e => setP({ ...p, orgName: e.target.value })} className="input-field" /></Field>
          <Field label="Contact Name"><input value={p.contactName || ''} onChange={e => setP({ ...p, contactName: e.target.value })} className="input-field" /></Field>
          <Field label="Contact Title"><input value={p.contactTitle || ''} onChange={e => setP({ ...p, contactTitle: e.target.value })} className="input-field" /></Field>
          <Field label="Contact Email *"><input type="email" value={p.contactEmail} onChange={e => setP({ ...p, contactEmail: e.target.value })} className="input-field" /></Field>
          <Field label="Contact Phone"><input value={p.contactPhone || ''} onChange={e => setP({ ...p, contactPhone: e.target.value })} className="input-field" /></Field>
          <Field label="Sponsor Form (for invite link)">
            <select value={p.sponsorFormId || ''} onChange={e => setP({ ...p, sponsorFormId: e.target.value || null })} className="input-field">
              <option value="">— Select —</option>
              {sponsorForms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </Field>
          <Field label="Notes"><textarea value={p.notes || ''} onChange={e => setP({ ...p, notes: e.target.value })} rows={2} className="input-field" /></Field>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-red-600 text-white rounded-lg">Save</button>
        </div>
      </div>
      <style>{`.input-field { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 14px; }`}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
    {children}
  </label>
);

export default AddProspectModal;
