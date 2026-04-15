import React, { useState } from 'react';
import { AppSettings } from '../../types';
import { Save } from 'lucide-react';
import { saveSettings } from '../../services/storageService';
import { useNotifications } from '../NotificationSystem';

interface Props {
  settings: AppSettings;
  onSaved: () => void | Promise<void>;
}

const TEMPLATES: Array<{ subjectKey: keyof AppSettings; bodyKey: keyof AppSettings; title: string; placeholders: string[] }> = [
  { subjectKey: 'sponsorInvitationSubject', bodyKey: 'sponsorInvitationBody', title: 'Sponsor Invitation', placeholders: ['orgName', 'contactName', 'event', 'eventDate', 'sponsorFormLink'] },
  { subjectKey: 'sponsorConfirmationPaidSubject', bodyKey: 'sponsorConfirmationPaidBody', title: 'Sponsor Confirmation (Paid)', placeholders: ['orgName', 'contactName', 'tier', 'itemsList', 'total', 'transactionId', 'event'] },
  { subjectKey: 'sponsorChequePledgeSubject', bodyKey: 'sponsorChequePledgeBody', title: 'Sponsor Cheque Pledge', placeholders: ['orgName', 'contactName', 'itemsList', 'total', 'mailingAddress', 'event'] },
  { subjectKey: 'sponsorChequeInternalSubject', bodyKey: 'sponsorChequeInternalBody', title: 'Cheque Notification (internal)', placeholders: ['orgName', 'contactName', 'contactEmail', 'contactPhone', 'itemsList', 'total', 'adminDashboardLink'] },
  { subjectKey: 'sponsorChequeReceivedSubject', bodyKey: 'sponsorChequeReceivedBody', title: 'Cheque Received Confirmation', placeholders: ['orgName', 'contactName', 'tier', 'itemsList', 'total', 'event'] },
];

const SponsorTemplatesTab: React.FC<Props> = ({ settings, onSaved }) => {
  const { showNotification } = useNotifications();
  const [s, setS] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(s);
      showNotification('Sponsor templates saved', 'success');
      await onSaved();
    } catch (e: any) {
      showNotification(`Save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold mb-4">Internal Cheque-Notification Recipients</h3>
        <p className="text-sm text-slate-600 mb-2">These addresses receive the internal notification when a sponsor submits a cheque pledge.</p>
        <textarea
          value={(s.sponsorChequeInternalRecipients || []).join('\n')}
          onChange={e => setS({ ...s, sponsorChequeInternalRecipients: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) })}
          rows={3}
          className="w-full border border-slate-300 rounded-lg p-2 text-sm font-mono"
          placeholder="gala@sicklecellanemia.ca&#10;communication@sicklecellanemia.ca"
        />
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold mb-4">Cheque Mailing Address</h3>
        <textarea
          value={s.sponsorChequeMailingAddress || ''}
          onChange={e => setS({ ...s, sponsorChequeMailingAddress: e.target.value })}
          rows={4}
          className="w-full border border-slate-300 rounded-lg p-2 text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="font-bold mb-4">HST Rate</h3>
        <input
          type="number"
          step="0.01"
          value={s.sponsorHstRate}
          onChange={e => setS({ ...s, sponsorHstRate: parseFloat(e.target.value) || 0 })}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-32"
        />
        <span className="ml-2 text-sm text-slate-500">e.g. 0.13 for 13%</span>
      </div>

      {TEMPLATES.map(t => (
        <div key={t.title} className="bg-white rounded-2xl shadow p-6">
          <h3 className="font-bold mb-4">{t.title}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">SUBJECT</label>
              <input
                value={String(s[t.subjectKey] || '')}
                onChange={e => setS({ ...s, [t.subjectKey]: e.target.value } as AppSettings)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">BODY (HTML)</label>
              <textarea
                value={String(s[t.bodyKey] || '')}
                onChange={e => setS({ ...s, [t.bodyKey]: e.target.value } as AppSettings)}
                rows={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="text-xs text-slate-500">
              <strong>Placeholders:</strong> {t.placeholders.map(p => `{{${p}}}`).join(', ')}
            </div>
          </div>
        </div>
      ))}

      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
          <Save className="w-4 h-4" /> Save All Templates
        </button>
      </div>
    </div>
  );
};

export default SponsorTemplatesTab;
