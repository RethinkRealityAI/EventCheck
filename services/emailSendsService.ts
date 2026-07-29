import { supabase } from './supabaseClient';

export interface EmailSend {
  id: string;
  trackingId: string;
  recipientEmail: string;
  recipientUserId: string | null;
  /** The attendee this send was for. `recipientEmail` is NOT an identity —
   *  partners share an inbox (CLAUDE.md §18) — so per-attendee tracking must
   *  key on this. Null on rows sent before the column existed, and on sends
   *  with no attendee (bulk contact campaigns). */
  recipientAttendeeId: string | null;
  subject: string;
  templateKey: string | null;
  formId: string | null;
  eventName: string | null;
  sentAt: string;
  sentBy: string | null;
  openedAt: string | null;
  clickCount: number;
  lastClickedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface LogEmailSendInput {
  trackingId: string;
  recipientEmail: string;
  recipientUserId?: string | null;
  /** Pass whenever the send targets a known attendee row. */
  recipientAttendeeId?: string | null;
  subject: string;
  templateKey?: string | null;
  formId?: string | null;
  eventName?: string | null;
  sentBy?: string | null;
  metadata?: Record<string, unknown>;
}

function mapRow(r: any): EmailSend {
  return {
    id: r.id,
    trackingId: r.tracking_id,
    recipientEmail: r.recipient_email,
    recipientUserId: r.recipient_user_id ?? null,
    recipientAttendeeId: r.recipient_attendee_id ?? null,
    subject: r.subject,
    templateKey: r.template_key ?? null,
    formId: r.form_id ?? null,
    eventName: r.event_name ?? null,
    sentAt: r.sent_at,
    sentBy: r.sent_by ?? null,
    openedAt: r.opened_at ?? null,
    clickCount: r.click_count ?? 0,
    lastClickedAt: r.last_clicked_at ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  };
}

export function generateTrackingId(): string {
  // 12-byte random id encoded as hex — collision-resistant enough for
  // per-tenant email volumes and short enough to fit cleanly in URLs.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function logEmailSend(input: LogEmailSendInput): Promise<EmailSend | null> {
  const { data, error } = await supabase
    .from('email_sends')
    .insert({
      tracking_id: input.trackingId,
      recipient_email: input.recipientEmail,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_attendee_id: input.recipientAttendeeId ?? null,
      subject: input.subject,
      template_key: input.templateKey ?? null,
      form_id: input.formId ?? null,
      event_name: input.eventName ?? null,
      sent_by: input.sentBy ?? null,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();
  if (error) {
    console.error('logEmailSend failed', error);
    return null;
  }
  return data ? mapRow(data) : null;
}

export async function getEmailSendsForEmail(email: string, limit = 50): Promise<EmailSend[]> {
  const { data, error } = await supabase
    .from('email_sends')
    .select('*')
    .ilike('recipient_email', email)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('getEmailSendsForEmail failed', error);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function getLatestEmailSendPerRecipient(): Promise<Map<string, EmailSend>> {
  const { byEmail } = await getLatestEmailSends();
  return byEmail;
}

/**
 * Most recent send indexed BOTH ways:
 *  - `byAttendeeId` — exact, and the only correct key when several attendees
 *    share one address (partners/colleagues; CLAUDE.md §18).
 *  - `byEmail` — the account-level view (portal profiles have unique emails)
 *    and the fallback for rows logged before `recipient_attendee_id` existed.
 *
 * Grabs the most recent rows and reduces client-side. For the scale this admin
 * view deals with (hundreds, not millions of sends) the naive fetch is fine;
 * add a SQL view if it ever grows.
 */
export async function getLatestEmailSends(): Promise<{
  byEmail: Map<string, EmailSend>;
  byAttendeeId: Map<string, EmailSend>;
}> {
  const { data, error } = await supabase
    .from('email_sends')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('getLatestEmailSends failed', error);
    return { byEmail: new Map(), byAttendeeId: new Map() };
  }
  const byEmail = new Map<string, EmailSend>();
  const byAttendeeId = new Map<string, EmailSend>();
  for (const row of data ?? []) {
    const mapped = mapRow(row);
    const emailKey = mapped.recipientEmail.toLowerCase();
    if (!byEmail.has(emailKey)) byEmail.set(emailKey, mapped);
    if (mapped.recipientAttendeeId && !byAttendeeId.has(mapped.recipientAttendeeId)) {
      byAttendeeId.set(mapped.recipientAttendeeId, mapped);
    }
  }
  return { byEmail, byAttendeeId };
}
