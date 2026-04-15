import React, { useEffect, useState } from 'react';
import { Attendee, AppSettings } from '../../types';
import { X, Download, CheckCircle } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';
import { generateReceiptPDF } from '../../utils/receiptGenerator';
import { updateAttendee } from '../../services/storageService';
import { useNotifications } from '../NotificationSystem';

interface Props {
  attendee: Attendee;
  settings: AppSettings;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  onMarkCheque: () => void;
}

const SponsorDetailModal: React.FC<Props> = ({ attendee, settings, onClose, onChanged, onMarkCheque }) => {
  const [guests, setGuests] = useState<any[]>([]);
  const [notes, setNotes] = useState(attendee.adminNotes || '');
  const { showNotification } = useNotifications();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('attendees').select('*').eq('primary_attendee_id', attendee.id).eq('is_primary', false);
      setGuests(data || []);
    })();
  }, [attendee.id]);

  const hstLine = (attendee.sponsorItems || []).filter(i => i.type === 'booth').reduce((s, i) => s + i.subtotal, 0) * (settings.sponsorHstRate || 0.13);

  const downloadReceipt = () => {
    const doc = generateReceiptPDF(attendee, settings, {
      status: attendee.paymentStatus === 'paid' ? 'paid' : 'pending',
      hstLineAmount: hstLine,
    });
    doc.save(`Receipt_${attendee.invoiceId || attendee.id.slice(0, 8)}.pdf`);
  };

  const saveNotes = async () => {
    await updateAttendee(attendee.id, { adminNotes: notes });
    showNotification('Notes saved', 'success');
    await onChanged();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start p-6 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-bold">{attendee.companyInfo?.orgName || attendee.name}</h2>
            <p className="text-sm text-slate-500">{attendee.companyInfo?.contactName} • {attendee.email}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          <section>
            <h3 className="font-bold mb-2">Sponsorship Items</h3>
            <table className="w-full text-sm">
              <tbody>
                {(attendee.sponsorItems || []).map(i => (
                  <tr key={i.key} className="border-b border-slate-100">
                    <td className="py-2">{i.label}{i.qty > 1 && ` × ${i.qty}`}</td>
                    <td className="py-2 text-right font-semibold">${i.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
                {hstLine > 0 && (
                  <tr><td className="py-2">HST ({((settings.sponsorHstRate || 0.13) * 100).toFixed(0)}%)</td><td className="py-2 text-right">${hstLine.toFixed(2)}</td></tr>
                )}
                <tr className="font-extrabold"><td className="py-2">Total</td><td className="py-2 text-right">{attendee.paymentAmount}</td></tr>
              </tbody>
            </table>
          </section>

          {(attendee.sponsoredAwards || []).length > 0 && (
            <section>
              <h3 className="font-bold mb-2">Sponsored Award</h3>
              <p>{(attendee.sponsoredAwards || []).join(', ')}</p>
            </section>
          )}

          {guests.length > 0 && (
            <section>
              <h3 className="font-bold mb-2">Tickets Issued ({guests.length})</h3>
              <div className="space-y-2">
                {guests.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                    <div>
                      <div className="font-semibold">{g.name}</div>
                      <div className="text-xs text-slate-500">{g.name.includes('Guest Ticket #') ? 'Unclaimed' : 'Claimed'}</div>
                    </div>
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/#/form/${attendee.formId}?ref=${g.id}`;
                        navigator.clipboard.writeText(url);
                        showNotification('Registration link copied', 'success');
                      }}
                      className="text-indigo-600 text-xs hover:underline"
                    >Copy link</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-bold mb-2">Admin Notes</h3>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm"
              placeholder="Internal notes about this sponsor…"
            />
          </section>

          <section className="flex flex-wrap gap-2">
            <button onClick={downloadReceipt} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
              <Download className="w-4 h-4" /> Download Receipt
            </button>
            {attendee.paymentStatus === 'pending' && (
              <button onClick={onMarkCheque} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">
                <CheckCircle className="w-4 h-4" /> Mark Cheque Received
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default SponsorDetailModal;
