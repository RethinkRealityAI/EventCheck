import React, { useEffect, useMemo, useState } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertTriangle, Eye, Search, Paperclip } from 'lucide-react';
import type { Attendee } from '../../types';
import ModalPortal from '../ModalPortal';
import {
  CUSTOM_TICKET_HELP,
  CUSTOM_TICKET_PRESETS,
  previewCustomTicket,
  sendCustomTickets,
  type CustomTicketPreview,
  type CustomTicketResult,
} from '../../services/customTicketEmail';

/**
 * Custom ticket email — admin-written words, real tickets.
 *
 * For batches the configured templates don't fit (people registered offline
 * through TSCS India, say). The admin picks recipients and writes one message;
 * the server attaches each recipient's own ticket PDF, the inline QR and a
 * download link, adds the tickets of anyone they booked for, and gives each
 * person a create-account link already tied to their ticket.
 *
 * Preview is per recipient and comes from the SAME server code that sends, so
 * what the admin reads is exactly what that person receives — including which
 * branch of each {{#if}} block they fall into.
 */

const DRAFT_KEY = 'custom-ticket-email-draft-v1';

type Phase = 'compose' | 'confirm' | 'sending' | 'done';

function loadDraft(): { subject: string; body: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function CustomTicketEmailModal({ candidates, onClose }: { candidates: Attendee[]; onClose: () => void }) {
  const preset = CUSTOM_TICKET_PRESETS[0];
  const draft = useMemo(loadDraft, []);
  const [subject, setSubject] = useState(draft?.subject ?? preset.subject);
  const [body, setBody] = useState(draft?.body ?? preset.body);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [onlyNeverSent, setOnlyNeverSent] = useState(false);
  const [previewId, setPreviewId] = useState<string>('');
  const [preview, setPreview] = useState<CustomTicketPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [phase, setPhase] = useState<Phase>('compose');
  const [results, setResults] = useState<CustomTicketResult[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, body })); } catch { /* private mode */ }
  }, [subject, body]);

  const byId = useMemo(() => new Map(candidates.map(a => [a.id, a])), [candidates]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter(a =>
      (!onlyNeverSent || !a.lastTicketEmailAt)
      && (!q || `${a.name} ${a.email} ${a.ticketType}`.toLowerCase().includes(q)));
  }, [candidates, query, onlyNeverSent]);
  const chosen = useMemo(() => candidates.filter(a => selected.has(a.id)), [candidates, selected]);

  // Keep the preview pointed at someone who is actually selected.
  useEffect(() => {
    if (!chosen.length) { setPreviewId(''); setPreview(null); return; }
    if (!chosen.some(a => a.id === previewId)) setPreviewId(chosen[0].id);
  }, [chosen, previewId]);

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allShownSelected = shown.length > 0 && shown.every(a => selected.has(a.id));
  const toggleAllShown = () => setSelected(s => {
    const n = new Set(s);
    shown.forEach(a => (allShownSelected ? n.delete(a.id) : n.add(a.id)));
    return n;
  });

  const runPreview = async () => {
    if (!previewId) return;
    setPreviewing(true);
    setPreviewError('');
    try {
      setPreview(await previewCustomTicket(previewId, subject, body));
    } catch (e) {
      setPreview(null);
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  // Any edit makes the last preview stale; clear it rather than show old copy.
  useEffect(() => { setPreview(null); }, [subject, body, previewId]);

  const send = async () => {
    setPhase('sending');
    setResults([]);
    await sendCustomTickets(chosen.map(a => a.id), subject, body, setResults);
    setPhase('done');
  };

  const sent = results.filter(r => r.status === 'sent').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const busy = phase === 'sending';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="custom-ticket-title" data-testid="custom-ticket-modal">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
          <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 id="custom-ticket-title" className="text-base font-bold text-slate-900">Custom ticket email</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Your words, their real ticket. Each person gets their own ticket PDF and QR, the tickets of anyone they
                booked for, and a create-account link already tied to their ticket.
              </p>
            </div>
            <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40">
              <X className="w-5 h-5" />
            </button>
          </div>

          {(phase === 'compose' || phase === 'confirm') && (
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[320px,1fr,1fr] gap-0 lg:divide-x divide-slate-100">
              {/* Recipients */}
              <section className="p-4 flex flex-col min-h-0" aria-label="Recipients">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">1 · Recipients ({chosen.length} selected)</h3>
                <div className="relative mt-2">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, category"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none" />
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input type="checkbox" checked={onlyNeverSent} onChange={e => setOnlyNeverSent(e.target.checked)} />
                  Only people never sent a ticket email
                </label>
                <button type="button" onClick={toggleAllShown} disabled={!shown.length}
                  className="mt-2 self-start text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-40">
                  {allShownSelected ? 'Clear' : 'Select'} all {shown.length} shown
                </button>
                <ul className="mt-2 flex-1 min-h-[160px] max-h-[50vh] overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                  {shown.map(a => (
                    <li key={a.id}>
                      <label className="flex items-start gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" className="mt-0.5" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800 truncate">{a.name}</span>
                          <span className="block text-slate-500 truncate">{a.email}</span>
                          <span className="block text-slate-400 truncate">
                            {a.ticketType}{a.lastTicketEmailAt ? ' · ticket emailed before' : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {!shown.length && <li className="px-3 py-6 text-center text-xs text-slate-400">No one matches.</li>}
                </ul>
                <p className="mt-2 text-[11px] text-slate-500">
                  Unclaimed seats (no email yet) are not listed. Companions who share the booker's email are covered
                  by the booker's email — select the booker.
                </p>
              </section>

              {/* Compose */}
              <section className="p-4 flex flex-col min-h-0" aria-label="Message">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">2 · Message</h3>
                  <select aria-label="Start from a preset" className="text-xs border border-slate-300 rounded-md px-2 py-1"
                    value="" onChange={e => {
                      const p = CUSTOM_TICKET_PRESETS.find(x => x.id === e.target.value);
                      if (p && window.confirm(`Replace the current message with "${p.label}"?`)) { setSubject(p.subject); setBody(p.body); }
                    }}>
                    <option value="">Start from…</option>
                    {CUSTOM_TICKET_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <label htmlFor="ct-subject" className="mt-3 text-xs font-semibold text-slate-600">Subject</label>
                <input id="ct-subject" value={subject} onChange={e => setSubject(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none" />
                <label htmlFor="ct-body" className="mt-3 text-xs font-semibold text-slate-600">Body (HTML)</label>
                <textarea id="ct-body" value={body} onChange={e => setBody(e.target.value)} spellCheck
                  className="mt-1 w-full flex-1 min-h-[280px] px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none" />
                <button type="button" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}
                  className="mt-2 self-start text-xs font-semibold text-indigo-600 hover:underline">
                  {showHelp ? 'Hide' : 'Show'} placeholders & conditions
                </button>
                {showHelp && (
                  <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-2">
                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                      {CUSTOM_TICKET_HELP.placeholders.map(([k, v]) => (
                        <React.Fragment key={k}><dt className="font-mono">{k}</dt><dd>{v}</dd></React.Fragment>
                      ))}
                    </dl>
                    <p>
                      Branch with <code className="font-mono">{'{{#if flag}}…{{else}}…{{/if}}'}</code> (no nesting). Flags:
                    </p>
                    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                      {CUSTOM_TICKET_HELP.flags.map(([k, v]) => (
                        <React.Fragment key={k}><dt className="font-mono">{k}</dt><dd>{v}</dd></React.Fragment>
                      ))}
                    </dl>
                  </div>
                )}
              </section>

              {/* Preview */}
              <section className="p-4 flex flex-col min-h-0" aria-label="Preview">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">3 · Preview as each recipient</h3>
                <div className="mt-2 flex gap-2">
                  <select aria-label="Preview as" value={previewId} onChange={e => setPreviewId(e.target.value)} disabled={!chosen.length}
                    className="flex-1 min-w-0 text-xs border border-slate-300 rounded-lg px-2 py-2">
                    {!chosen.length && <option value="">Select recipients first</option>}
                    {chosen.map(a => <option key={a.id} value={a.id}>{a.name} — {a.email}</option>)}
                  </select>
                  <button type="button" onClick={runPreview} disabled={!previewId || previewing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Preview
                  </button>
                </div>
                {previewError && (
                  <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{previewError}</p>
                )}
                {preview ? (
                  <>
                    <div className="mt-3 text-xs text-slate-600 space-y-1">
                      <p><span className="text-slate-400">To:</span> {preview.to}</p>
                      <p><span className="text-slate-400">Subject:</span> <strong className="text-slate-800">{preview.subject}</strong></p>
                      <p className="flex items-start gap-1">
                        <Paperclip className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                        {preview.attachments.length ? preview.attachments.join(', ') : 'No ticket PDF could be built — check this attendee'}
                      </p>
                      <p className="text-slate-400">
                        {preview.flags.has_account ? 'Has an account' : 'No account yet'} ·{' '}
                        {preview.flags.is_companion ? 'Companion' : 'Booker'} ·{' '}
                        {preview.companions.length ? `Booked for ${preview.companions.join(', ')}` : 'Booked for no one else'}
                      </p>
                    </div>
                    <iframe title="Email preview" sandbox="" srcDoc={preview.html}
                      className="mt-3 w-full flex-1 min-h-[420px] border border-slate-200 rounded-lg bg-white" />
                  </>
                ) : !previewError && (
                  <p className="mt-6 text-xs text-slate-400 text-center">
                    {chosen.length ? 'Press Preview to see exactly what this person will receive.' : 'Pick at least one recipient.'}
                  </p>
                )}
              </section>
            </div>
          )}

          {(phase === 'sending' || phase === 'done') && (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-center gap-3 text-sm">
                {busy && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                <span className="text-slate-700" role="status" aria-live="polite">
                  {busy ? `Sending… ${results.length} of ${chosen.length}` : `${sent} sent · ${failed} failed`}
                </span>
              </div>
              <ul className="mt-3 divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {results.map(r => (
                  <li key={r.attendeeId} className="px-3 py-1.5 text-xs flex items-center gap-2">
                    {r.status === 'sent'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                    <span className="font-medium text-slate-800 truncate">{byId.get(r.attendeeId)?.name ?? r.attendeeId}</span>
                    <span className="ml-auto text-slate-500 truncate text-right">
                      {r.status === 'sent' ? `Sent to ${r.to}` : r.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
            {phase === 'compose' && (
              <>
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button onClick={() => setPhase('confirm')} disabled={!chosen.length || !subject.trim() || !body.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
                  <Send className="w-4 h-4" /> Send to {chosen.length}…
                </button>
              </>
            )}
            {phase === 'confirm' && (
              <>
                <span className="mr-auto text-xs text-slate-600">
                  Send this email and their tickets to <strong>{chosen.length}</strong> {chosen.length === 1 ? 'person' : 'people'} now?
                </span>
                <button onClick={() => setPhase('compose')} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>
                <button onClick={send} data-testid="custom-ticket-send"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                  <Send className="w-4 h-4" /> Yes, send
                </button>
              </>
            )}
            {(phase === 'sending' || phase === 'done') && (
              <button onClick={onClose} disabled={busy}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
                {busy ? 'Sending…' : 'Done'}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
