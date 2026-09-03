// Data access for the India (TSCS) registration pipeline admin page.
//
// Reads go straight to Postgres — both tables grant SELECT to `authenticated`,
// so the browser client can list them with the admin's own session and no
// server round-trip. Writes go through the tscs-email-ingest edge function,
// which holds the service-role key and the IMAP credentials; the admin's JWT
// authorises the call (see that function's AUTH header comment), so nobody
// needs the shared ingest secret to press a button.

import { supabase } from './supabaseClient';

export type TscsEmailStatus = 'ingested' | 'needs-review' | 'duplicate' | 'error' | 'ignored';

export interface TscsEmailRow {
  id: string;
  messageId: string;
  fromAddr: string | null;
  subject: string | null;
  receivedAt: string | null;
  raw: string | null;
  parsed: Record<string, any> | null;
  status: TscsEmailStatus;
  attendeeId: string | null;
  error: string | null;
  isTest: boolean;
  createdAt: string;
}

export interface TscsPollRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  dryRun: boolean;
  source: string;
  processed: number;
  ingested: number;
  needsReview: number;
  duplicates: number;
  ignored: number;
  errors: number;
  error: string | null;
  triggeredBy: string | null;
}

function mapEmail(r: any): TscsEmailRow {
  return {
    id: r.id,
    messageId: r.message_id,
    fromAddr: r.from_addr ?? null,
    subject: r.subject ?? null,
    receivedAt: r.received_at ?? null,
    raw: r.raw ?? null,
    parsed: r.parsed ?? null,
    status: r.status,
    attendeeId: r.attendee_id ?? null,
    error: r.error ?? null,
    isTest: !!r.is_test,
    createdAt: r.created_at,
  };
}

function mapRun(r: any): TscsPollRun {
  return {
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    ok: !!r.ok,
    dryRun: !!r.dry_run,
    source: r.source,
    processed: r.processed ?? 0,
    ingested: r.ingested ?? 0,
    needsReview: r.needs_review ?? 0,
    duplicates: r.duplicates ?? 0,
    ignored: r.ignored ?? 0,
    errors: r.errors ?? 0,
    error: r.error ?? null,
    triggeredBy: r.triggered_by ?? null,
  };
}

/** List columns only — `raw` is deliberately excluded (it stores up to 100k
 *  chars per message and is rendered for exactly one row at a time). Use
 *  getTscsEmailBody() when the review modal opens. */
const LIST_COLUMNS =
  'id, message_id, from_addr, subject, received_at, parsed, status, attendee_id, error, is_test, created_at';

export async function getTscsEmails(limit = 200): Promise<TscsEmailRow[]> {
  const { data, error } = await supabase
    .from('tscs_email_registrations')
    .select(LIST_COLUMNS)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    console.error('Failed to load TSCS email queue', error);
    throw error;
  }
  return (data || []).map(mapEmail);
}

/** The stored body of one message, fetched only when a human opens it. */
export async function getTscsEmailBody(messageId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('tscs_email_registrations')
    .select('raw')
    .eq('message_id', messageId)
    .maybeSingle();
  if (error) {
    console.error('Failed to load TSCS email body', error);
    throw error;
  }
  return (data as any)?.raw ?? null;
}

export async function getTscsPollRuns(limit = 25): Promise<TscsPollRun[]> {
  const { data, error } = await supabase
    .from('tscs_poll_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Failed to load TSCS poll runs', error);
    throw error;
  }
  return (data || []).map(mapRun);
}

/** Edge functions fail two ways: a non-2xx, or a 200 whose body carries
 *  `{ error }`. Both must surface with their real reason — an admin who sees
 *  only "non-2xx status code" cannot tell an unrecognised category from a dead
 *  mailbox. supabase-js sets `data = null` on non-2xx and stashes the JSON body
 *  on `error.context`, so that is where the detail lives (same trap documented
 *  in services/adminUserActionsService.ts). */
async function invoke<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tscs-email-ingest', { body });
  if (error) {
    let detail = '';
    try {
      const parsed = await (error as any).context?.json?.();
      detail = parsed?.error || parsed?.message || '';
    } catch { /* body wasn't JSON */ }
    throw new Error(detail || error.message || 'India ingest action failed.');
  }
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as T;
}

export interface PollResultMessage {
  messageId: string;
  from: string;
  status: string;
  recorded: string;
  attendeeId: string | null;
  error: string | null;
  subject?: string;
  parsed?: Record<string, any> | null;
  rawPreview?: string;
}

export async function runTscsPoll(opts: { dryRun?: boolean } = {}): Promise<{
  ok: boolean; processed: number; results: PollResultMessage[]; dryRun: boolean;
}> {
  return invoke({ mode: 'poll', dryRun: opts.dryRun === true, source: 'dashboard' });
}

export async function ingestTscsRegistration(args: {
  registration: Record<string, unknown>;
  messageId?: string;
  dryRun?: boolean;
  isTest?: boolean;
  source?: string;
}): Promise<{ ok: boolean; status: string; attendeeId?: string; createdCount?: number }> {
  return invoke({
    mode: 'ingest',
    registration: args.registration,
    messageId: args.messageId,
    dryRun: args.dryRun === true,
    isTest: args.isTest === true,
    source: args.source || 'dashboard (manual review)',
  });
}

export async function setTscsEmailStatus(args: {
  messageId: string;
  status: 'ignored' | 'needs-review';
  note?: string;
}): Promise<{ ok: boolean }> {
  return invoke({ mode: 'dismiss', messageId: args.messageId, status: args.status, note: args.note });
}

export async function getTscsHealth(): Promise<{
  ok: boolean; imapConfigured: boolean; formId: string; allowedSenders: string;
}> {
  return invoke({ mode: 'health' });
}
