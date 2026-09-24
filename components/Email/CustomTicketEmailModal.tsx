import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Send, Loader2, CheckCircle2, AlertTriangle, Search, Paperclip, RefreshCw, ChevronDown, Users, Mail, RotateCcw,
} from 'lucide-react';
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
 * Layout: composer (recipients + message) on the left, a live preview filling
 * the right on large screens; stacked below `lg`. Preview is per recipient and
 * comes from the SAME server code that sends — including which branch of each
 * {{#if}} block that person falls into — and refreshes itself after edits.
 */

const DRAFT_KEY = 'custom-ticket-email-draft-v1';
const PREVIEW_DEBOUNCE_MS = 700;

type Phase = 'compose' | 'confirm' | 'sending' | 'done';

function loadDraft(): { subject: string; body: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

const Badge: React.FC<{ tone: 'slate' | 'emerald' | 'amber' | 'indigo'; children: React.ReactNode }> = ({ tone, children }) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    indigo: 'bg-indigo-50 text-indigo-700',
  } as const;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
};

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
  const [sendList, setSendList] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const previewSeq = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, body })); } catch { /* private mode */ }
  }, [subject, body]);

  const busy = phase === 'sending';

  // Escape closes, except mid-send (closing would hide which sends failed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const byId = useMemo(() => new Map(candidates.map(a => [a.id, a])), [candidates]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter(a =>
      (!onlyNeverSent || !a.lastTicketEmailAt)
      && (!q || `${a.name} ${a.email} ${a.ticketType} ${a.adminNotes ?? ''}`.toLowerCase().includes(q)));
  }, [candidates, query, onlyNeverSent]);
  const chosen = useMemo(() => candidates.filter(a => selected.has(a.id)), [candidates, selected]);

  // Keep the preview pointed at someone who is actually selected.
  useEffect(() => {
    if (!chosen.length) { setPreviewId(''); setPreview(null); setPreviewError(''); return; }
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

  // Live preview: re-render (debounced) whenever the copy or the person changes.
  // A sequence number drops responses that arrive after a newer request.
  const runPreview = async () => {
    if (!previewId || !subject.trim() || !body.trim()) return;
    const seq = ++previewSeq.current;
    setPreviewing(true);
    setPreviewError('');
    try {
      const p = await previewCustomTicket(previewId, subject, body);
      if (seq === previewSeq.current) setPreview(p);
    } catch (e) {
      if (seq === previewSeq.current) { setPreview(null); setPreviewError((e as Error).message); }
    } finally {
      if (seq === previewSeq.current) setPreviewing(false);
    }
  };
  useEffect(() => {
    if (!previewId || phase !== 'compose') return;
    const t = window.setTimeout(runPreview, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewId, subject, body, phase]);

  const send = async (ids: string[]) => {
    setSendList(ids);
    setPhase('sending');
    setResults([]);
    await sendCustomTickets(ids, subject, body, setResults);
    setPhase('done');
  };

  const sent = results.filter(r => r.status === 'sent').length;
  const failedIds = results.filter(r => r.status === 'failed').map(r => r.attendeeId);
  const previewIndex = chosen.findIndex(a => a.id === previewId);
  const step = (dir: 1 | -1) => {
    if (!chosen.length) return;
    const next = (previewIndex + dir + chosen.length) % chosen.length;
    setPreviewId(chosen[next].id);
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
  const sectionTitle = 'flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="custom-ticket-title" data-testid="custom-ticket-modal">
        <div className="bg-white shadow-2xl w-full h-full sm:h-[92vh] sm:max-w-7xl sm:rounded-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200 shrink-0">
            <div className="min-w-0">
              <h2 id="custom-ticket-title" className="text-base font-bold text-slate-900">Custom ticket email</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Your words, their real ticket. Each person gets their own ticket PDF and QR, the tickets of anyone they
                booked for, and a create-account link already tied to their ticket.
              </p>
            </div>
            <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40">
              <X className="w-5 h-5" />
            </button>
          </div>

          {(phase === 'compose' || phase === 'confirm') && (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
              {/* ── Left: composer ─────────────────────────────────────── */}
              <div className="lg:w-[44%] xl:w-[40%] shrink-0 min-w-0 lg:overflow-y-auto lg:border-r border-slate-200">
                {/* Recipients */}
                <section aria-labelledby="ct-recipients" className="p-5 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="ct-recipients" className={sectionTitle}><Users className="w-3.5 h-3.5" /> 1 · Recipients</h3>
                    <Badge tone={chosen.length ? 'indigo' : 'slate'}>{chosen.length} selected</Badge>
                  </div>
                  <div className="relative mt-3">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, category or notes"
                      aria-label="Search recipients" className={`${inputClass} pl-9`} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" className="rounded" checked={onlyNeverSent} onChange={e => setOnlyNeverSent(e.target.checked)} />
                      Never sent a ticket email
                    </label>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <button type="button" onClick={toggleAllShown} disabled={!shown.length}
                        className="text-indigo-600 hover:underline disabled:opacity-40">
                        {allShownSelected ? 'Deselect' : 'Select'} all {shown.length} shown
                      </button>
                      {selected.size > 0 && (
                        <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">Clear</button>
                      )}
                    </div>
                  </div>
                  <ul className="mt-2 h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100" aria-label="People">
                    {shown.map(a => (
                      <li key={a.id}>
                        <label className={`flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 ${selected.has(a.id) ? 'bg-indigo-50/60' : ''}`}>
                          <input type="checkbox" className="mt-1 rounded shrink-0" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-800 truncate">{a.name}</span>
                              {a.lastTicketEmailAt && <span className="shrink-0 text-[10px] font-semibold text-slate-400 uppercase">Emailed before</span>}
                            </span>
                            <span className="block text-xs text-slate-500 truncate">{a.email}</span>
                            <span className="block text-[11px] text-slate-400 truncate">{a.ticketType}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                    {!shown.length && <li className="px-3 py-8 text-center text-xs text-slate-400">No one matches.</li>}
                  </ul>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                    Not listed: unclaimed seats (no email yet), and companions who share their booker's email — their
                    ticket goes out with the booker's.
                  </p>
                </section>

                {/* Message */}
                <section aria-labelledby="ct-message" className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="ct-message" className={sectionTitle}><Mail className="w-3.5 h-3.5" /> 2 · Message</h3>
                    <select aria-label="Start from a preset" className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white max-w-[55%]"
                      value="" onChange={e => {
                        const p = CUSTOM_TICKET_PRESETS.find(x => x.id === e.target.value);
                        if (p && window.confirm(`Replace the current message with "${p.label}"?`)) { setSubject(p.subject); setBody(p.body); }
                      }}>
                      <option value="">Start from a preset…</option>
                      {CUSTOM_TICKET_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <label htmlFor="ct-subject" className="block mt-3 text-xs font-semibold text-slate-600">Subject</label>
                  <input id="ct-subject" value={subject} onChange={e => setSubject(e.target.value)} className={`mt-1 ${inputClass}`} />
                  <label htmlFor="ct-body" className="block mt-4 text-xs font-semibold text-slate-600">Body (HTML)</label>
                  <textarea id="ct-body" value={body} onChange={e => setBody(e.target.value)} spellCheck
                    className="mt-1 block w-full h-80 resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />

                  <div className="mt-3 rounded-lg border border-slate-200">
                    <button type="button" onClick={() => setShowHelp(v => !v)} aria-expanded={showHelp}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700">
                      Placeholders & conditions
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showHelp ? 'rotate-180' : ''}`} />
                    </button>
                    {showHelp && (
                      <div className="border-t border-slate-100 px-3 py-3 text-[11px] text-slate-600 space-y-3">
                        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
                          {CUSTOM_TICKET_HELP.placeholders.map(([k, v]) => (
                            <React.Fragment key={k}><dt className="font-mono text-slate-800 break-all">{k}</dt><dd>{v}</dd></React.Fragment>
                          ))}
                        </dl>
                        <p>
                          Branch with <code className="font-mono bg-slate-100 rounded px-1">{'{{#if flag}}…{{else}}…{{/if}}'}</code> (no nesting):
                        </p>
                        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
                          {CUSTOM_TICKET_HELP.flags.map(([k, v]) => (
                            <React.Fragment key={k}><dt className="font-mono text-slate-800">{k}</dt><dd>{v}</dd></React.Fragment>
                          ))}
                        </dl>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* ── Right: live preview ───────────────────────────────── */}
              <section aria-labelledby="ct-preview" className="flex-1 min-w-0 min-h-[640px] lg:min-h-0 flex flex-col bg-slate-50 border-t lg:border-t-0 border-slate-200">
                <div className="px-5 pt-5 pb-3 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="ct-preview" className={sectionTitle}>3 · Preview as each recipient</h3>
                    {previewing && <span className="flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => step(-1)} disabled={chosen.length < 2} aria-label="Previous recipient"
                      className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">‹</button>
                    <select aria-label="Preview as" value={previewId} onChange={e => setPreviewId(e.target.value)} disabled={!chosen.length}
                      className="flex-1 min-w-0 text-sm border border-slate-300 rounded-lg px-2 py-2 bg-white truncate">
                      {!chosen.length && <option value="">Select recipients to preview</option>}
                      {chosen.map((a, i) => <option key={a.id} value={a.id}>{i + 1}/{chosen.length} · {a.name} — {a.email}</option>)}
                    </select>
                    <button type="button" onClick={() => step(1)} disabled={chosen.length < 2} aria-label="Next recipient"
                      className="px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">›</button>
                    <button type="button" onClick={runPreview} disabled={!previewId || previewing} aria-label="Refresh preview" title="Refresh preview"
                      className="p-2 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                      <RefreshCw className={`w-4 h-4 ${previewing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {preview && (
                    <div className="mt-3 rounded-lg bg-white border border-slate-200 px-3 py-2.5 text-xs text-slate-600 space-y-1.5 min-w-0">
                      <p className="truncate"><span className="text-slate-400">To</span> <span className="text-slate-800">{preview.to}</span></p>
                      <p className="truncate"><span className="text-slate-400">Subject</span> <strong className="text-slate-900">{preview.subject}</strong></p>
                      <p className="flex items-start gap-1.5 min-w-0">
                        <Paperclip className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                        <span className={`min-w-0 break-words ${preview.attachments.length ? '' : 'text-red-700 font-semibold'}`}>
                          {preview.attachments.length ? preview.attachments.join(' · ') : 'No ticket PDF could be built — check this attendee before sending'}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <Badge tone={preview.flags.has_account ? 'emerald' : 'amber'}>{preview.flags.has_account ? 'Has an account' : 'No account yet'}</Badge>
                        <Badge tone="slate">{preview.flags.is_companion ? 'Companion' : 'Booker'}</Badge>
                        {preview.companions.length > 0 && <Badge tone="indigo">Booked for {preview.companions.join(', ')}</Badge>}
                      </div>
                    </div>
                  )}
                  {previewError && (
                    <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words" role="alert">{previewError}</p>
                  )}
                </div>

                <div className="relative flex-1 min-h-0 px-5 pb-5">
                  {preview ? (
                    <iframe title="Email preview" sandbox="" srcDoc={preview.html}
                      className={`w-full h-full min-h-[480px] rounded-lg border border-slate-200 bg-white transition-opacity ${previewing ? 'opacity-60' : ''}`} />
                  ) : (
                    <div className="h-full min-h-[320px] rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center p-6 text-center">
                      <p className="text-sm text-slate-400 max-w-xs">
                        {previewing ? 'Rendering…' : chosen.length
                          ? 'The preview appears here and updates as you edit.'
                          : 'Select recipients on the left to see exactly what each of them will receive.'}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {(phase === 'sending' || phase === 'done') && (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3">
                  {busy
                    ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    : failedIds.length ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                  <p className="text-sm font-semibold text-slate-800" role="status" aria-live="polite">
                    {busy ? `Sending… ${results.length} of ${sendList.length}` : `${sent} sent · ${failedIds.length} failed`}
                  </p>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${sendList.length ? (results.length / sendList.length) * 100 : 0}%` }} />
                </div>
                <ul className="mt-4 divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {results.map(r => (
                    <li key={r.attendeeId} className="px-3 py-2 text-xs flex items-center gap-2 min-w-0">
                      {r.status === 'sent'
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
                      <span className="font-medium text-slate-800 truncate">{byId.get(r.attendeeId)?.name ?? r.attendeeId}</span>
                      <span className={`ml-auto truncate text-right ${r.status === 'sent' ? 'text-slate-500' : 'text-red-700'}`}>
                        {r.status === 'sent' ? `Sent to ${r.to}` : r.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2 shrink-0 bg-white">
            {phase === 'compose' && (
              <>
                <span className="mr-auto text-xs text-slate-500">
                  {chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'person' : 'people'} will each get their own email.` : 'No recipients selected yet.'}
                </span>
                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button onClick={() => setPhase('confirm')} disabled={!chosen.length || !subject.trim() || !body.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
                  <Send className="w-4 h-4" /> Send to {chosen.length}…
                </button>
              </>
            )}
            {phase === 'confirm' && (
              <>
                <span className="mr-auto text-sm text-slate-700">
                  Send this email and their tickets to <strong>{chosen.length}</strong> {chosen.length === 1 ? 'person' : 'people'} now?
                </span>
                <button onClick={() => setPhase('compose')} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back</button>
                <button onClick={() => send(chosen.map(a => a.id))} data-testid="custom-ticket-send" autoFocus
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                  <Send className="w-4 h-4" /> Yes, send
                </button>
              </>
            )}
            {(phase === 'sending' || phase === 'done') && (
              <>
                {phase === 'done' && failedIds.length > 0 && (
                  <button onClick={() => send(failedIds)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <RotateCcw className="w-4 h-4" /> Retry {failedIds.length} failed
                  </button>
                )}
                <button onClick={onClose} disabled={busy}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
                  {busy ? 'Sending…' : 'Done'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
