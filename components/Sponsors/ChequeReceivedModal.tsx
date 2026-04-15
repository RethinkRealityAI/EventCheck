import React, { useState, useEffect } from 'react';
import { Attendee, AppSettings } from '../../types';
import { X, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { generateReceiptPDF } from '../../utils/receiptGenerator';
import { generateTicketPDF } from '../../utils/pdfGenerator';
import { sendTicketEmail, arrayBufferToBase64 } from '../../services/smtpService';
import { buildSponsorEmailContext, mergeTemplate } from '../../utils/sponsorEmailTemplates';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendee: Attendee;
  settings: AppSettings;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
}

const ChequeReceivedModal: React.FC<Props> = ({ attendee, settings, onClose, onConfirmed }) => {
  const { showNotification } = useNotifications();
  const [subject, setSubject] = useState(settings.sponsorChequeReceivedSubject);
  const [body, setBody] = useState(settings.sponsorChequeReceivedBody);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const ctx = buildSponsorEmailContext(attendee, settings, { event: 'Hope Gala & Awards 2026' });
    setSubject(mergeTemplate(settings.sponsorChequeReceivedSubject, ctx));
    setBody(mergeTemplate(settings.sponsorChequeReceivedBody, ctx));
  }, [attendee, settings]);

  const handleConfirm = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('confirm-sponsor-cheque', { body: { attendeeId: attendee.id } });
      if (error || (data && data.error)) throw new Error(data?.error || error?.message || 'confirm-sponsor-cheque failed');

      const updated = { ...attendee, paymentStatus: 'paid' as const };
      const hstLine = (updated.sponsorItems || []).filter(i => i.type === 'booth').reduce((s, i) => s + i.subtotal, 0) * (settings.sponsorHstRate || 0.13);

      const receiptDoc = generateReceiptPDF(updated, settings, { status: 'paid', hstLineAmount: hstLine });
      const receiptAtt = { filename: `Receipt_${updated.invoiceId || updated.id.slice(0,8)}.pdf`, content: arrayBufferToBase64(receiptDoc.output('arraybuffer') as ArrayBuffer), contentType: 'application/pdf' };

      const attachments: any[] = [receiptAtt];
      for (const g of (data.guests || [])) {
        const guestAttendee = { ...updated, id: g.id, name: g.name, qrPayload: g.qr_payload, isPrimary: false };
        const regUrl = `${window.location.origin}/#/form/${updated.formId}?ref=${g.id}`;
        const ticketDoc = generateTicketPDF(guestAttendee as any, settings, undefined, regUrl);
        attachments.push({ filename: `Ticket_${g.name.replace(/[^a-z0-9]/gi, '_')}.pdf`, content: arrayBufferToBase64(ticketDoc.output('arraybuffer') as ArrayBuffer), contentType: 'application/pdf' });
      }

      await sendTicketEmail(settings, {
        to: updated.email,
        subject,
        name: updated.companyInfo?.contactName || updated.name,
        message: body,
        attachments,
      });

      showNotification('Cheque confirmed and confirmation email sent.', 'success');
      await onConfirmed();
    } catch (e: any) {
      showNotification(`Failed: ${e.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold">Mark Cheque Received</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">This will flip the sponsor to <strong>Paid</strong>, generate guest tickets (if the tier includes seats), and send a confirmation email. Review and edit before sending.</p>
          <div>
            <label className="block text-sm font-semibold mb-1">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Email Body (HTML)</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-6 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300">Cancel</button>
          <button onClick={handleConfirm} disabled={sending} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirm & Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChequeReceivedModal;
