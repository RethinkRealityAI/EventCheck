import React, { useMemo, useState } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react';
import type { Attendee } from '../../types';
import {
  COMPLETION_SKIP_REASONS,
  sendCompletionLinks,
  type CompletionSendResult,
} from '../../services/registrationCompletion';
import ModalPortal from '../ModalPortal';

/**
 * Confirm → progress → results for sending completion links to many people.
 *
 * Each person gets their own signed link, so this cannot ride the generic bulk
 * email modal (one composed message, placeholder vars). The results stay on
 * screen by design: an admin sending to twenty registrants needs to see who was
 * skipped and why — a spent daily quota most of all — not a toast that says
 * "done" and disappears.
 */
export default function CompletionSendDialog({ recipients, onClose }: { recipients: Attendee[]; onClose: () => void }) {
  const [phase, setPhase] = useState<'confirm' | 'sending' | 'done'>('confirm');
  const [results, setResults] = useState<CompletionSendResult[]>([]);
  const [error, setError] = useState('');
  const byId = useMemo(() => new Map(recipients.map(r => [r.id, r])), [recipients]);

  const run = async () => {
    setPhase('sending');
    setError('');
    try {
      await sendCompletionLinks(recipients.map(r => r.id), { onProgress: setResults });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase('done');
    }
  };

  const sent = results.filter(r => r.status === 'sent').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const quotaHit = results.some(r => r.reason === 'quota' || (r.status === 'failed' && /quota|rate limit|too many/i.test(r.reason || '')));

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="completion-send-title" data-testid="completion-send-dialog">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 id="completion-send-title" className="text-base font-bold text-slate-900">Ask for missing registration details</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Each person gets a personal link that asks only what they have not answered.
            </p>
          </div>
          <button onClick={onClose} disabled={phase === 'sending'} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {phase === 'confirm' && (
            <>
              <p className="text-sm text-slate-700">
                Send a completion link to <strong>{recipients.length}</strong> registrant{recipients.length === 1 ? '' : 's'} with
                unanswered questions or consents not given?
              </p>
              <ul className="mt-3 max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {recipients.map(r => (
                  <li key={r.id} className="px-3 py-1.5 text-xs flex justify-between gap-3">
                    <span className="font-medium text-slate-800 truncate">{r.name}</span>
                    <span className="text-slate-500 truncate">{r.email}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-500 mt-3">
                Anyone already complete, still unclaimed, or registered by their organisation is skipped automatically.
                Sending stops if the daily email limit is reached, and tells you who was not reached.
              </p>
            </>
          )}

          {phase !== 'confirm' && (
            <>
              <div className="flex items-center gap-3 text-sm">
                {phase === 'sending' && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
                <span className="text-slate-700" role="status" aria-live="polite">
                  {phase === 'sending'
                    ? `Sending… ${results.length} of ${recipients.length}`
                    : `${sent} sent · ${skipped} skipped · ${failed} failed`}
                </span>
              </div>
              {quotaHit && (
                <p className="mt-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  The daily email limit was reached. Everyone marked "not sent" can be retried tomorrow.
                </p>
              )}
              {error && (
                <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
              )}
              <ul className="mt-3 divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {results.map(r => {
                  const person = byId.get(r.attendeeId);
                  const icon = r.status === 'sent'
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    : r.status === 'failed'
                      ? <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      : <MinusCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
                  return (
                    <li key={r.attendeeId} className="px-3 py-1.5 text-xs flex items-center gap-2">
                      {icon}
                      <span className="font-medium text-slate-800 truncate">{person?.name ?? r.attendeeId}</span>
                      <span className="ml-auto text-slate-500 truncate text-right">
                        {r.status === 'sent' ? 'Sent' : (COMPLETION_SKIP_REASONS[r.reason ?? ''] ?? r.reason ?? r.status)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          {phase === 'confirm' ? (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={run} data-testid="completion-send-confirm"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                <Send className="w-4 h-4" /> Send {recipients.length} link{recipients.length === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <button onClick={onClose} disabled={phase === 'sending'}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
              {phase === 'sending' ? 'Sending…' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
