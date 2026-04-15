import React, { useState, useMemo } from 'react';
import { SponsorProspect, AppSettings, Form } from '../../types';
import { X, Send, Loader2 } from 'lucide-react';
import { sendTicketEmail } from '../../services/smtpService';
import { logProspectEmail, getForms } from '../../services/storageService';
import { buildProspectEmailContext, mergeTemplate } from '../../utils/sponsorEmailTemplates';
import { useNotifications } from '../NotificationSystem';

interface Props {
  prospects: SponsorProspect[];
  settings: AppSettings;
  onClose: () => void;
  onSent: () => void | Promise<void>;
}

const SendInvitationModal: React.FC<Props> = ({ prospects, settings, onClose, onSent }) => {
  const { showNotification } = useNotifications();
  const [subject, setSubject] = useState(settings.sponsorInvitationSubject);
  const [body, setBody] = useState(settings.sponsorInvitationBody);
  const [sending, setSending] = useState(false);
  const [forms, setForms] = useState<Form[]>([]);

  React.useEffect(() => { getForms().then(setForms); }, []);

  const preview = useMemo(() => {
    if (!prospects[0]) return { subject, body };
    const formId = prospects[0].sponsorFormId;
    const formUrl = formId ? `${window.location.origin}/#/form/${formId}` : '';
    const ctx = buildProspectEmailContext(prospects[0], formUrl);
    return { subject: mergeTemplate(subject, ctx), body: mergeTemplate(body, ctx) };
  }, [prospects, subject, body]);

  const handleSend = async () => {
    setSending(true);
    try {
      for (const p of prospects) {
        const formId = p.sponsorFormId;
        const formUrl = formId ? `${window.location.origin}/#/form/${formId}` : '';
        const ctx = buildProspectEmailContext(p, formUrl);
        const mergedSubject = mergeTemplate(subject, ctx);
        const mergedBody = mergeTemplate(body, ctx);
        await sendTicketEmail(settings, {
          to: p.contactEmail,
          subject: mergedSubject,
          name: p.contactName || p.orgName,
          message: mergedBody,
        });
        await logProspectEmail(p.id, {
          sentAt: new Date().toISOString(),
          subject: mergedSubject,
          templateKey: 'sponsor-invitation',
          recipientEmail: p.contactEmail,
        });
      }
      showNotification(`Sent ${prospects.length} invitation(s)`, 'success');
      await onSent();
      onClose();
    } catch (e: any) {
      showNotification(`Send failed: ${e.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Send Invitation ({prospects.length} recipient{prospects.length !== 1 ? 's' : ''})</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600">Recipients: {prospects.map(p => p.contactEmail).join(', ')}</div>
          <div>
            <label className="block text-sm font-semibold mb-1">Subject (template)</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Body (HTML, template)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="text-xs font-bold uppercase text-slate-500 mb-2">Preview (first recipient)</div>
            <div className="text-sm font-semibold">{preview.subject}</div>
            <div className="text-sm mt-2" dangerouslySetInnerHTML={{ __html: preview.body }} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send {prospects.length} invitation{prospects.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SendInvitationModal;
