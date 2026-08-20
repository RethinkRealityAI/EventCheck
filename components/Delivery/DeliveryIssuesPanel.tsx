import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, RefreshCw, Check, Loader2, Mail, ChevronDown, ChevronRight } from 'lucide-react';
import {
  groupFailuresByRecipient,
  planRetry,
  failureKindLabel,
  retryLikelyToFailAgain,
  type EmailFailureRecord,
  type RecipientGroup,
} from '../../utils/emailFailures';
import {
  getUnresolvedEmailFailures,
  resolveEmailFailures,
  retryEmailFailure,
} from '../../services/emailFailuresService';

interface Props {
  onClose: () => void;
  /** Refresh the caller's unresolved count after retries. */
  onChanged?: () => void;
}

type RowState = 'idle' | 'retrying' | 'sent' | 'failed';

/**
 * "Who didn't get their email, and can I fix it?"
 *
 * Grouped by PERSON rather than by failure: a provider outage writes one row
 * per recipient in a single run, so an ungrouped list would be 78 near-identical
 * lines. An admin thinks in people.
 *
 * Portalled to document.body — the dashboard's backdrop-blur ancestors clip
 * position:fixed (standing rule).
 */
export const DeliveryIssuesPanel: React.FC<Props> = ({ onClose, onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EmailFailureRecord[]>([]);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const load = async () => {
    setLoading(true);
    setRows(await getUnresolvedEmailFailures());
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => groupFailuresByRecipient(rows, origin), [rows, origin]);

  // A provider-wide stoppage is the headline, not a per-row detail: retrying
  // into a closed door just burns sends.
  const blockedKind = useMemo(
    () => groups.find(g => retryLikelyToFailAgain(g.latest.kind))?.latest.kind ?? null,
    [groups],
  );

  // Returns the outcome so `retryAll` can react to it immediately. Reading it
  // back out of React state inside the loop would see the PREVIOUS render's
  // value and miss the stop condition entirely.
  const retryGroup = async (group: RecipientGroup): Promise<{ ok: boolean; error?: string }> => {
    const target = group.failures.find(f => planRetry(f, origin).kind === 'auto');
    if (!target) return { ok: false, error: 'not retryable' };
    const plan = planRetry(target, origin);
    if (plan.kind !== 'auto') return { ok: false, error: 'not retryable' };

    setStates(p => ({ ...p, [group.recipient]: 'retrying' }));
    setErrors(p => ({ ...p, [group.recipient]: '' }));
    const res = await retryEmailFailure(plan.body);
    if (res.ok) {
      // Resolve EVERY failure for this address, not just the one retried — the
      // person now has their email, so leaving siblings unresolved would keep
      // nagging about something already fixed.
      await resolveEmailFailures(group.failures.map(f => f.id), 'Retried from the dashboard');
      setStates(p => ({ ...p, [group.recipient]: 'sent' }));
      onChanged?.();
      return { ok: true };
    }
    setStates(p => ({ ...p, [group.recipient]: 'failed' }));
    setErrors(p => ({ ...p, [group.recipient]: res.error }));
    return { ok: false, error: res.error };
  };

  const retryAll = async () => {
    setBulkRunning(true);
    for (const g of groups) {
      if (states[g.recipient] === 'sent' || !g.anyRetryable) continue;
      const res = await retryGroup(g);
      // Stop the moment the provider refuses everything again — the same rule
      // the bulk senders follow. Uses the returned value, not state.
      if (!res.ok && res.error && /sending limit|credentials/i.test(res.error)) break;
      await new Promise(r => setTimeout(r, 400));
    }
    setBulkRunning(false);
  };

  const dismissGroup = async (group: RecipientGroup) => {
    await resolveEmailFailures(group.failures.map(f => f.id), 'Dismissed by an admin');
    setRows(prev => prev.filter(r => !group.failures.some(f => f.id === r.id)));
    onChanged?.();
  };

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const retryableCount = groups.filter(g => g.anyRetryable && states[g.recipient] !== 'sent').length;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label="Email delivery issues">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-amber-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">Email delivery issues</h2>
              <p className="text-xs text-gray-600 truncate">
                {loading
                  ? 'Loading…'
                  : groups.length === 0
                    // "0 people did not receive an email" is a clumsy way to say
                    // good news, and it sits right above the all-clear state.
                    ? 'Nothing outstanding'
                    : `${groups.length} ${groups.length === 1 ? 'person' : 'people'} did not receive an email`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-amber-100 text-gray-500" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {blockedKind && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-900">
              <strong>{failureKindLabel(blockedKind)}.</strong>{' '}
              {blockedKind === 'quota'
                ? 'The provider is refusing mail for this period, so retries will fail until the limit resets or the plan is raised.'
                : 'Retries will keep failing until this is resolved at the provider.'}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-gray-500"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : groups.length === 0 ? (
            <div className="p-10 text-center">
              <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-700">No delivery issues. Every email we tried to send got through.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {groups.map(g => {
                const state = states[g.recipient] ?? 'idle';
                const firstPlan = planRetry(g.latest, origin);
                const isOpen = expanded.has(g.recipient);
                return (
                  <li key={g.recipient} className="px-6 py-3.5">
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggle(g.recipient)} className="mt-0.5 p-0.5 text-gray-400 hover:text-gray-700" aria-label={isOpen ? 'Hide details' : 'Show details'}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm break-all">{g.recipient}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{failureKindLabel(g.latest.kind)}</span>
                          {g.count > 1 && <span className="text-[11px] text-gray-500">{g.count} attempts</span>}
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {g.latest.subject || g.latest.templateKey || g.latest.mode || 'Email'}
                          {' · '}
                          {new Date(g.latest.occurredAt).toLocaleString()}
                        </p>
                        {state === 'failed' && errors[g.recipient] && (
                          <p className="text-xs text-red-700 mt-1">{errors[g.recipient]}</p>
                        )}
                        {state === 'sent' && (
                          <p className="text-xs text-green-700 mt-1 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Sent — marked resolved.</p>
                        )}
                        {isOpen && (
                          <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5">
                            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Provider response</p>
                            <p className="text-xs font-mono text-gray-800 break-all">{g.latest.message || '(none recorded)'}</p>
                            {firstPlan.kind !== 'auto' && (
                              <p className="text-xs text-gray-600 pt-1">{(firstPlan as any).reason}</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {g.anyRetryable && state !== 'sent' && (
                          <button
                            onClick={() => void retryGroup(g)}
                            disabled={state === 'retrying' || bulkRunning}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gansid-secondary text-white text-xs font-semibold disabled:opacity-50 hover:opacity-90"
                          >
                            {state === 'retrying' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => void dismissGroup(g)}
                          disabled={bulkRunning}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Retries rebuild the email server-side from the attendee&rsquo;s record.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => void load()} disabled={bulkRunning} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              Refresh
            </button>
            {retryableCount > 0 && (
              <button
                onClick={() => void retryAll()}
                disabled={bulkRunning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gansid-primary-gradient text-white text-xs font-semibold disabled:opacity-50"
              >
                {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Retry all ({retryableCount})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
