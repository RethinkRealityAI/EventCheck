import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, TicketCheck, Loader2, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { getForms } from '../../services/storageService';
import { supabase } from '../../services/supabaseClient';
import type { Form } from '../../types';
import type { ImportedContact } from '../../services/importedContactsService';

const DEFAULT_FORM_ID = 'gansid-congress-2026-invite';
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type RowStatus = 'pending' | 'sending' | 'sent' | 'resent' | 'failed';

interface Props {
  open: boolean;
  contacts: ImportedContact[];
  onClose: () => void;
  onComplete: () => void;
}

// Issues a FREE ticket to each selected contact (via the admin-gated
// contact-issue-ticket edge fn) and emails them a secure download link — no form
// to fill. Throttled (50 per batch, 30s pause) to stay gentle on SMTP.
const IssueTicketModal: React.FC<Props> = ({ open, contacts, onClose, onComplete }) => {
  const [forms, setForms] = useState<Form[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formId, setFormId] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFormsLoading(true);
    (async () => {
      try {
        const all = await getForms();
        if (cancelled) return;
        const usable = all.filter(f => f.status !== 'closed');
        setForms(usable);
        setFormId(prev => prev || usable.find(f => f.id === DEFAULT_FORM_ID)?.id || usable[0]?.id || '');
      } finally { if (!cancelled) setFormsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const selectedForm = useMemo(() => forms.find(f => f.id === formId) || null, [forms, formId]);
  const withEmail = useMemo(() => contacts.filter(c => (c.email || '').trim()), [contacts]);
  const counts = useMemo(() => {
    const v = Object.values(statuses);
    return {
      sent: v.filter(s => s === 'sent' || s === 'resent').length,
      failed: v.filter(s => s === 'failed').length,
    };
  }, [statuses]);

  if (!open) return null;

  const handleSend = async () => {
    if (!formId || sending || withEmail.length === 0) return;
    setSending(true);
    setDone(false);
    let i = 0;
    for (const c of withEmail) {
      setStatuses(prev => ({ ...prev, [c.id]: 'sending' }));
      try {
        const { data, error } = await supabase.functions.invoke('contact-issue-ticket', {
          body: { contactId: c.id, formId, origin: window.location.origin },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message || 'failed');
        setStatuses(prev => ({ ...prev, [c.id]: (data as any)?.resent ? 'resent' : 'sent' }));
      } catch {
        setStatuses(prev => ({ ...prev, [c.id]: 'failed' }));
      }
      i++;
      // Gentle on SMTP: pause between batches of 50; a small delay otherwise.
      await sleep(i % 50 === 0 && i < withEmail.length ? 30000 : 300);
    }
    setSending(false);
    setDone(true);
    onComplete();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm bg-black/20 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label="Send ticket">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gansid-primary-gradient">
          <div className="flex items-center gap-2 text-white">
            <TicketCheck className="w-5 h-5" />
            <div>
              <h3 className="text-lg font-bold">Send ticket</h3>
              <p className="text-white/80 text-xs">Issue a free ticket to {withEmail.length} contact{withEmail.length !== 1 ? 's' : ''} — no form to fill</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={sending} className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label htmlFor="it-form" className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Ticket for</label>
            <div className="relative">
              <select id="it-form" value={formId} onChange={e => setFormId(e.target.value)} disabled={formsLoading || sending} className="w-full appearance-none pr-9 px-3 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40">
                {formsLoading && <option>Loading forms…</option>}
                {!formsLoading && forms.map(f => <option key={f.id} value={f.id}>{f.title}{f.status !== 'active' ? ` (${f.status})` : ''}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>
          </div>

          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5 text-xs text-indigo-800">
            Each contact gets a free ticket for <strong>{selectedForm?.title || 'this form'}</strong>, emailed with a secure download link — exactly as if they'd registered. Already-registered contacts get their ticket resent (no duplicates).
          </div>

          {contacts.length !== withEmail.length && (
            <p className="text-xs text-amber-700">{contacts.length - withEmail.length} contact(s) without an email will be skipped.</p>
          )}

          {(sending || done) && (
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-52 overflow-y-auto">
              {withEmail.map(c => {
                const s = statuses[c.id] || 'pending';
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="truncate">{c.name || c.email}</span>
                    <span className="shrink-0 ml-2">
                      {s === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {(s === 'sent' || s === 'resent') && <span className="text-emerald-600 flex items-center gap-1 text-xs"><CheckCircle2 className="w-4 h-4" />{s === 'resent' ? 'resent' : 'sent'}</span>}
                      {s === 'failed' && <span className="text-red-600 flex items-center gap-1 text-xs"><XCircle className="w-4 h-4" />failed</span>}
                      {s === 'pending' && <span className="text-gray-300 text-xs">…</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">{done ? `Done — ${counts.sent} sent, ${counts.failed} failed` : sending ? `Sending… ${counts.sent + counts.failed}/${withEmail.length}` : `${withEmail.length} recipient${withEmail.length !== 1 ? 's' : ''}`}</span>
          {done ? (
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gansid-primary-gradient text-white text-sm font-semibold">Close</button>
          ) : (
            <button type="button" onClick={handleSend} disabled={sending || !formId || withEmail.length === 0} className="px-4 py-2 rounded-lg bg-gansid-primary-gradient text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {sending && <Loader2 className="w-4 h-4 animate-spin" />} Send ticket{withEmail.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default IssueTicketModal;
