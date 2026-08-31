// TSCS India registration ingest.
//
// India congress registrations are collected on the partner's page
// (tscsindia.org/gansid-registration) in INR via TSCS's Razorpay account.
// The agreed integration signal (v1) is the confirmation EMAIL their
// WordPress sends to our dedicated IONOS mailbox. This function:
//
//   mode 'poll'   — reads that mailbox over IMAP, verifies the sender,
//                   parses each new message (see _shared/tscsEmailParse.ts),
//                   creates the attendee rows, fires the ticket email, and
//                   records every message in tscs_email_registrations
//                   (unparseable ones as 'needs-review', never dropped).
//   mode 'ingest' — same registration pipeline fed with an explicit JSON
//                   payload. Used by admins to finish a 'needs-review' row by
//                   hand, by tests (with isTest/dryRun), and later by any
//                   direct relay TSCS adds.
//   mode 'health' — reports which env pieces are configured (no secrets).
//
// AUTH: gateway-open (the poller is a GitHub Actions cron, and Razorpay-style
// signatures don't exist for email), so EVERY request must carry
// x-ingest-secret matching the TSCS_INGEST_SECRET env — checked before
// anything else. Without the header the function does nothing at all.
//
// Trust model: email is forgeable, so ingested rows record their evidence
// (message id, sender, payment id) in answers/admin_notes, the sender must
// match TSCS_ALLOWED_SENDERS, and payment ids de-duplicate via
// attendees.transaction_id. This is the accepted v1 tradeoff; a signed
// server-to-server relay from TSCS's WordPress is the designed upgrade path.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signRegistrationToken } from '../_shared/registrationToken.ts';
import { buildAppUrl, resolveOrigin } from '../_shared/emailLinks.ts';
import {
  parseTscsEmail,
  senderAllowed,
  type TscsRegistration,
} from '../_shared/tscsEmailParse.ts';
import { buildTscsAttendeeRows } from '../_shared/tscsIngestRows.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const TSCS_FORM_ID = Deno.env.get('TSCS_FORM_ID') || 'gansid-congress-2026';
const PRICING_TEMPLATE_ID = Deno.env.get('TSCS_PRICING_TEMPLATE_ID') || 'c569ab4f-883b-42e9-8892-4405fa67217e';

interface IngestOutcome {
  ok: boolean;
  status: 'ingested' | 'duplicate' | 'error';
  attendeeId?: string;
  createdCount?: number;
  error?: string;
}

/** Create the attendee rows for one parsed TSCS registration. */
async function ingestRegistration(
  supabase: any,
  reg: TscsRegistration,
  opts: { source: string; messageId?: string; isTest?: boolean; dryRun?: boolean; origin: string },
): Promise<IngestOutcome> {
  const built = buildTscsAttendeeRows(reg, {
    source: opts.source,
    messageId: opts.messageId,
    isTest: opts.isTest,
    formId: TSCS_FORM_ID,
    pricingTemplateId: PRICING_TEMPLATE_ID,
  });
  if (!built.ok) return { ok: false, status: 'error', error: built.error };
  const { rows, primaryId, txnBase } = built;

  const { data: existing } = await supabase
    .from('attendees').select('id').eq('transaction_id', txnBase).limit(1);
  if (existing && existing.length > 0) {
    return { ok: true, status: 'duplicate', attendeeId: existing[0].id };
  }

  if (opts.dryRun) return { ok: true, status: 'ingested', attendeeId: primaryId, createdCount: rows.length };

  const { error: insErr } = await supabase.from('attendees').insert(rows);
  if (insErr) return { ok: false, status: 'error', error: `insert failed: ${insErr.message}` };

  // Ticket email — same registration-confirmed path every other paid flow uses.
  try {
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = await signRegistrationToken(primaryId, TSCS_FORM_ID, secret, Date.now(), 180 * 24 * 60 * 60 * 1000);
    const base = resolveOrigin(opts.origin, Deno.env.get('PUBLIC_SITE_URL'));
    const downloadUrl = base ? buildAppUrl(base, `/#/tickets?token=${encodeURIComponent(token)}`) : '';
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ mode: 'registration-confirmed', primaryAttendeeId: primaryId, downloadUrl }),
    });
    if (!resp.ok) console.error('[tscs-ingest] ticket email failed', resp.status, await resp.text());
  } catch (e) {
    console.error('[tscs-ingest] ticket email threw', String(e));
  }

  return { ok: true, status: 'ingested', attendeeId: primaryId, createdCount: rows.length };
}

/** Record the message in the audit/review table (idempotent on message_id). */
async function recordEmail(supabase: any, row: {
  message_id: string; from_addr?: string; subject?: string; received_at?: string;
  raw?: string; parsed?: unknown; status: string; attendee_id?: string; error?: string; is_test?: boolean;
}): Promise<'inserted' | 'duplicate' | 'error'> {
  const { error } = await supabase.from('tscs_email_registrations').insert({
    ...row,
    raw: row.raw ? String(row.raw).slice(0, 100_000) : null,
  });
  if (!error) return 'inserted';
  if (String(error.code) === '23505') return 'duplicate';
  console.error('[tscs-ingest] audit insert failed', error.message);
  return 'error';
}

/** IMAP poll of the IONOS mailbox. */
async function pollMailbox(supabase: any, origin: string, dryRun: boolean): Promise<Response> {
  const host = Deno.env.get('TSCS_IMAP_HOST') || 'imap.ionos.com';
  const port = Number(Deno.env.get('TSCS_IMAP_PORT') || 993);
  const user = Deno.env.get('TSCS_IMAP_USER');
  const pass = Deno.env.get('TSCS_IMAP_PASS');
  const allowedSenders = Deno.env.get('TSCS_ALLOWED_SENDERS') || '@tscsindia.org';
  if (!user || !pass) return json({ error: 'TSCS_IMAP_USER / TSCS_IMAP_PASS not configured' }, 500);

  // npm compat: imapflow + mailparser run on the edge runtime's Node shims.
  const { ImapFlow } = await import('npm:imapflow@1.0.164');
  const { simpleParser } = await import('npm:mailparser@3.7.1');

  const client = new ImapFlow({
    host, port, secure: true,
    auth: { user, pass },
    logger: false,
    socketTimeout: 30_000,
  });

  const results: any[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const unseen = await client.search({ seen: false });
      const uids: number[] = (unseen || []).slice(0, 25); // bounded per run
      for (const uid of uids) {
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
        if (!msg?.source) continue;
        const parsedMail = await simpleParser(msg.source);
        const fromAddr = parsedMail.from?.value?.[0]?.address || msg.envelope?.from?.[0]?.address || '';
        const messageId = (parsedMail.messageId || msg.envelope?.messageId || `uid-${uid}-${host}`).slice(0, 250);
        const subject = parsedMail.subject || msg.envelope?.subject || '';
        const receivedAt = (parsedMail.date || new Date()).toISOString();

        let outcomeRow: any = { message_id: messageId, from_addr: fromAddr, subject, received_at: receivedAt };

        if (!senderAllowed(fromAddr, allowedSenders)) {
          outcomeRow = { ...outcomeRow, status: 'ignored', error: 'sender not in allow-list' };
        } else {
          const parsed = parseTscsEmail({ subject, text: parsedMail.text || '', html: typeof parsedMail.html === 'string' ? parsedMail.html : '' });
          if (!parsed.ok) {
            outcomeRow = {
              ...outcomeRow,
              status: 'needs-review',
              raw: parsedMail.text || String(parsedMail.html || ''),
              error: parsed.reason,
            };
          } else {
            const outcome = await ingestRegistration(supabase, parsed.registration, {
              source: `email-poll (${parsed.via})`, messageId, origin, dryRun,
            });
            outcomeRow = {
              ...outcomeRow,
              status: outcome.status,
              parsed: parsed.registration,
              raw: parsedMail.text || String(parsedMail.html || ''),
              attendee_id: outcome.attendeeId,
              error: outcome.error,
            };
          }
        }

        let recorded: string = 'skipped (dry run)';
        if (!dryRun) {
          recorded = await recordEmail(supabase, outcomeRow);
          if (recorded !== 'error') {
            // Mark seen only after the audit row exists — an unseen message is
            // the retry mechanism.
            await client.messageFlagsAdd(uid, ['\\Seen']);
          }
        }
        results.push({ messageId, from: fromAddr, status: outcomeRow.status, recorded, attendeeId: outcomeRow.attendee_id ?? null, error: outcomeRow.error ?? null });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch { /* already gone */ }
    return json({ error: `IMAP poll failed: ${String(e)}`, processed: results }, 502);
  }
  return json({ ok: true, processed: results.length, results, dryRun });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const secret = Deno.env.get('TSCS_INGEST_SECRET');
  if (!secret || req.headers.get('x-ingest-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const mode = String(body?.mode || '');
  const origin = (req.headers.get('origin') || '').toLowerCase();

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (mode === 'health') {
    return json({
      ok: true,
      imapConfigured: !!(Deno.env.get('TSCS_IMAP_USER') && Deno.env.get('TSCS_IMAP_PASS')),
      formId: TSCS_FORM_ID,
      allowedSenders: Deno.env.get('TSCS_ALLOWED_SENDERS') || '@tscsindia.org',
    });
  }

  if (mode === 'poll') {
    return await pollMailbox(supabase, origin, body?.dryRun === true);
  }

  if (mode === 'ingest') {
    const reg = body?.registration;
    if (!reg || typeof reg !== 'object' || !reg.email || !reg.name || !reg.category) {
      return json({ error: 'registration requires at least name, email, category' }, 400);
    }
    const outcome = await ingestRegistration(supabase, reg as TscsRegistration, {
      source: String(body?.source || 'manual'),
      messageId: body?.messageId ? String(body.messageId) : undefined,
      isTest: body?.isTest === true,
      dryRun: body?.dryRun === true,
      origin,
    });
    if (!outcome.ok) return json({ error: outcome.error, status: outcome.status }, 422);
    // Completing a queued email by hand: close its needs-review audit row so
    // the queue reflects reality. Best-effort — the ingest already succeeded.
    if (body?.messageId && !body?.dryRun) {
      await supabase.from('tscs_email_registrations')
        .update({ status: outcome.status, attendee_id: outcome.attendeeId ?? null, error: null, parsed: reg })
        .eq('message_id', String(body.messageId));
    }
    return json(outcome);
  }

  return json({ error: `unknown mode: ${mode || '(none)'}` }, 400);
});
