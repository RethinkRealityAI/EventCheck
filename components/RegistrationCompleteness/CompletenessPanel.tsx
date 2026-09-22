import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Send, Link2, Loader2 } from 'lucide-react';
import type { Attendee } from '../../types';
import type { CompletionStatus } from '../../utils/registrationCompletion';
import {
  COMPLETION_SKIP_REASONS,
  getCompletionLink,
  sendCompletionLinks,
} from '../../services/registrationCompletion';
import { useNotifications } from '../NotificationSystem';

/**
 * What this registration is still missing, and the two ways to ask for it.
 *
 * Built for the case that motivated it: a TSCS India registrant or a comped
 * speaker is ticketed, but nobody asked their dietary needs, their emergency
 * contact, or for their agreement to the event terms. The panel says exactly
 * which, separates "never asked" from "asked and left blank", and puts the fix
 * one click away.
 */
export default function CompletenessPanel({ attendee, status }: { attendee: Attendee; status: CompletionStatus }) {
  const { showNotification } = useNotifications();
  const [busy, setBusy] = useState<null | 'send' | 'copy'>(null);

  if (status.eligible === false) {
    const copy: Record<string, string> = {
      'pending-seat': 'This seat has not been claimed yet — its holder completes the claim form, not this one.',
      'org-delegate': 'Registered by their organisation. Delegates complete the staff form.',
      'org-booking': 'This is an organisation’s booking, not a person’s registration.',
      'no-form': 'The form this registration came from no longer exists.',
    };
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        {copy[status.reason]}
      </div>
    );
  }

  const { report } = status;
  const completedAt = (attendee.answers as Record<string, unknown> | undefined)?._completed_at as string | undefined;

  const send = async () => {
    setBusy('send');
    try {
      const [result] = await sendCompletionLinks([attendee.id], { force: report.complete });
      if (result?.status === 'sent') showNotification(`Completion link sent to ${attendee.email}`, 'success');
      else showNotification(COMPLETION_SKIP_REASONS[result?.reason ?? ''] ?? result?.reason ?? 'Not sent', result?.status === 'failed' ? 'error' : 'info');
    } catch (e) {
      showNotification((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    setBusy('copy');
    try {
      const url = await getCompletionLink(attendee.id);
      await navigator.clipboard.writeText(url);
      showNotification('Completion link copied', 'success');
    } catch (e) {
      showNotification((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const actions = (
    <div className="flex flex-wrap gap-2 mt-3">
      <button onClick={send} disabled={!!busy} data-testid="completion-send"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
        {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {report.complete ? 'Send link anyway' : 'Send completion link'}
      </button>
      <button onClick={copy} disabled={!!busy} data-testid="completion-copy"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50">
        {busy === 'copy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
        Copy link
      </button>
    </div>
  );

  if (report.complete) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3" data-testid="completeness-panel">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="w-4 h-4" /> Registration details complete
        </div>
        <p className="text-xs text-emerald-900/70 mt-1">
          {completedAt ? `Completed by the registrant on ${new Date(completedAt).toLocaleDateString()}. ` : ''}
          {report.declined.length > 0 && `Left ${report.declined.length} optional question${report.declined.length === 1 ? '' : 's'} blank when asked.`}
        </p>
      </div>
    );
  }

  const questions = report.outstanding.filter(f => f.type !== 'boolean');
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3" data-testid="completeness-panel">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <AlertCircle className="w-4 h-4" />
        {report.outstanding.length} question{report.outstanding.length === 1 ? '' : 's'} never answered
      </div>
      <p className="text-xs text-amber-900/70 mt-1">
        Usually because they registered through a route that asks less than this form — a partner's page, or an admin comp.
      </p>
      {questions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {questions.map(f => (
            <span key={f.id} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${f.required ? 'bg-white text-amber-900 border-amber-300' : 'bg-white/60 text-slate-600 border-slate-200'}`}>
              {f.label}{f.required ? ' *' : ''}
            </span>
          ))}
        </div>
      )}
      {report.consentsMissing.length > 0 && (
        <p className="text-xs font-semibold text-amber-900 mt-2.5">
          Has not agreed to {report.consentsMissing.length} required polic{report.consentsMissing.length === 1 ? 'y' : 'ies'} (terms, liability or photo consent).
        </p>
      )}
      {actions}
    </div>
  );
}
