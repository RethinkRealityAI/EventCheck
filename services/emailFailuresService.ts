import { supabase } from './supabaseClient';
import type { EmailFailureRecord } from '../utils/emailFailures';

// Reads/writes for `email_failures`. RLS is admin-read + admin-update via
// is_portal_admin(); inserts come from send-ticket-email on the service role,
// so this module never inserts.

function mapRow(r: any): EmailFailureRecord {
  return {
    id: r.id,
    occurredAt: r.occurred_at,
    mode: r.mode ?? null,
    templateKey: r.template_key ?? null,
    recipient: r.recipient ?? null,
    formId: r.form_id ?? null,
    attendeeId: r.attendee_id ?? null,
    kind: r.kind ?? null,
    message: r.message ?? null,
    subject: r.subject ?? null,
    resolvedAt: r.resolved_at ?? null,
  };
}

/** Unresolved failures, newest first. */
export async function getUnresolvedEmailFailures(limit = 200): Promise<EmailFailureRecord[]> {
  const { data, error } = await supabase
    .from('email_failures')
    .select('*')
    .is('resolved_at', null)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('getUnresolvedEmailFailures failed', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/**
 * Mark failures resolved.
 *
 * Rowcount-checked per the standing rule: `.update()` silently affects zero
 * rows under RLS without erroring, which would show a green "resolved" while
 * the row stayed in the list on the next refresh.
 */
export async function resolveEmailFailures(ids: string[], note: string): Promise<boolean> {
  if (ids.length === 0) return true;
  const { data, error } = await supabase
    .from('email_failures')
    .update({ resolved_at: new Date().toISOString(), resolved_note: note })
    .in('id', ids)
    .select('id');
  if (error) {
    console.warn('resolveEmailFailures failed', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

/**
 * Re-send from a failure record.
 *
 * Returns the same shape the UI needs to decide what to show: ok plus the real
 * provider message when it fails again (read off error.context, since
 * supabase-js only exposes the generic non-2xx string on .message).
 */
export async function retryEmailFailure(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { extractInvokeError, classifyEmailFailure } = await import('../utils/emailSendErrors');
  try {
    const { data, error } = await supabase.functions.invoke('send-ticket-email', { body });
    if (error) {
      const raw = await extractInvokeError(error);
      return { ok: false, error: classifyEmailFailure(raw).message };
    }
    if ((data as any)?.error) {
      return { ok: false, error: classifyEmailFailure(String((data as any).error)).message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: classifyEmailFailure(String(e?.message ?? e)).message };
  }
}
