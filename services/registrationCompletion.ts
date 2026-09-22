// Client side of "complete your registration" — see
// supabase/functions/registration-complete/index.ts for the server and its
// security model. Public calls carry the signed token; admin calls carry the
// admin's own session (supabase.functions.invoke attaches it).

import { supabase } from './supabaseClient';
import { extractInvokeError } from '../utils/emailSendErrors';
import type { CompletenessField } from '../supabase/functions/_shared/registrationCompleteness';

export interface ResolvedCompletion {
  site: 'gansid' | 'scago';
  eventName: string;
  attendee: { firstName: string; name: string; email: string };
  complete: boolean;
  completedAt: string | null;
  fields: CompletenessField[];
  outstandingIds: string[];
  answers: Record<string, unknown>;
  summary: Array<{ label: string; value: string }>;
}

export type CompletionSendStatus = 'sent' | 'skipped' | 'failed';

export interface CompletionSendResult {
  attendeeId: string;
  status: CompletionSendStatus;
  reason?: string;
  email?: string;
}

/** Human copy for the server's skip / refusal reasons. */
export const COMPLETION_SKIP_REASONS: Record<string, string> = {
  'already-complete': 'Already complete',
  'pending-seat': 'Seat not claimed yet — send the claim link',
  'org-delegate': 'Registered by their organisation — uses the staff form',
  'org-booking': 'Sponsor / exhibitor booking',
  'test-row': 'Test registration',
  'no-form': 'No form to complete',
  'not-found': 'Registration not found',
  quota: 'Not sent — the daily email limit was reached',
};

/** An error carrying the server's human message and, for validation, the field. */
export class CompletionError extends Error {
  constructor(message: string, public code?: string, public fieldId?: string) { super(message); }
}

/**
 * Read an invoke failure ONCE. The server answers `{ error: code, message:
 * human copy, fieldId? }`; the shared extractInvokeError prefers `error`, which
 * would show a registrant "expired" instead of what to do about it. The body is
 * a one-shot stream, so it is read here and nowhere else.
 */
async function toCompletionError(error: unknown): Promise<CompletionError> {
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && (body.message || body.error)) {
        return new CompletionError(String(body.message ?? body.error), body.error, body.fieldId);
      }
    } catch { /* not JSON — fall back below */ }
  }
  return new CompletionError(await extractInvokeError(error));
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('registration-complete', { body });
  if (error) throw await toCompletionError(error);
  return data as T;
}

export async function resolveCompletion(token: string): Promise<ResolvedCompletion> {
  return invoke<ResolvedCompletion>({ action: 'resolve', token });
}

/** Resolves on success; rejects with a CompletionError naming the field on validation failure. */
export async function submitCompletion(
  token: string,
  answers: Record<string, unknown>,
): Promise<{ ok: true; complete: boolean }> {
  return invoke<{ ok: true; complete: boolean }>({ action: 'complete', token, answers });
}

/** Admin: a fresh link for one registration, for "Copy link". */
export async function getCompletionLink(attendeeId: string): Promise<string> {
  const data = await invoke<{ url: string }>({ action: 'link', attendeeId, origin: window.location.origin });
  return data.url;
}

/**
 * Admin: email completion links. The server caps a request at 25 and stops a
 * batch on a spent quota, so larger selections go in sequential chunks and the
 * caller sees every row's outcome.
 */
export async function sendCompletionLinks(
  attendeeIds: string[],
  opts: { force?: boolean; onProgress?: (done: CompletionSendResult[]) => void } = {},
): Promise<CompletionSendResult[]> {
  const all: CompletionSendResult[] = [];
  for (let i = 0; i < attendeeIds.length; i += 25) {
    const chunk = attendeeIds.slice(i, i + 25);
    const data = await invoke<{ results: CompletionSendResult[] }>({
      action: 'send', attendeeIds: chunk, origin: window.location.origin, force: !!opts.force,
    });
    all.push(...data.results);
    opts.onProgress?.([...all]);
    // Once the quota is spent every later send fails the same way. Check the
    // failure text too: if the limit hit on the LAST row of a chunk, the server
    // had nothing left to mark 'quota', and the next chunk would just fail again.
    const quotaHit = data.results.some(r =>
      r.reason === 'quota' || (r.status === 'failed' && /quota|rate limit|too many/i.test(r.reason || '')));
    if (quotaHit) {
      for (const id of attendeeIds.slice(i + 25)) all.push({ attendeeId: id, status: 'skipped', reason: 'quota' });
      opts.onProgress?.([...all]);
      break;
    }
  }
  return all;
}
