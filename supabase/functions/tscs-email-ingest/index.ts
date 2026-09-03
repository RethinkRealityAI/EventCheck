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
//   mode 'dismiss' — triage only: park a reviewed message as 'ignored' (a
//                   partner test payment, a duplicate) or reopen it as
//                   'needs-review'. Never touches attendees.
//   mode 'health' — reports which env pieces are configured (no secrets).
//
// Every poll attempt writes one row to tscs_poll_runs, success or failure, so
// the dashboard can distinguish "checked minutes ago, nothing new" from "the
// cron has been dead for days" — a healthy poll of an empty mailbox is
// otherwise indistinguishable from no poll at all. Messages that fail to parse
// also raise a one-off summary email to TSCS_ALERT_EMAIL, because a review
// queue nobody watches is a registration that silently never happens.
//
// AUTH: gateway-open (verify_jwt=false — the poller is a GitHub Actions cron
// with no Supabase session), so the function authenticates callers itself and
// accepts exactly two, additively:
//   1. x-ingest-secret matching TSCS_INGEST_SECRET — cron and CLI;
//   2. a Supabase JWT belonging to an admin/super_admin — the dashboard's
//      India Registrations page, so admins never need the shared secret.
// Anything else does nothing at all.
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
import { plainTextToHtml, renderEmailShell } from '../_shared/emailShell.ts';
import {
  parseTscsEmail,
  senderAllowed,
  paymentStateOf,
  type TscsRegistration,
} from '../_shared/tscsEmailParse.ts';
import { buildTscsAttendeeRows } from '../_shared/tscsIngestRows.ts';
import { buildPollRunRow } from '../_shared/tscsPollRun.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-supabase-client-platform / x-supabase-api-version are load-bearing: the
  // browser SDK sends them on the preflight, and omitting them here makes the
  // dashboard's supabase.functions.invoke fail before it ever reaches us.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ingest-secret, x-supabase-client-platform, x-supabase-api-version',
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
  if (insErr) {
    // The partial unique index on razorpay transaction_ids backstops the
    // select-then-insert race: a concurrent ingest of the same payment loses
    // here and must be treated as the duplicate it is, not an error.
    if (String(insErr.code) === '23505') {
      const { data: winner } = await supabase
        .from('attendees').select('id').eq('transaction_id', txnBase).limit(1);
      return { ok: true, status: 'duplicate', attendeeId: winner?.[0]?.id };
    }
    return { ok: false, status: 'error', error: `insert failed: ${insErr.message}` };
  }

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

/** One row per poll ATTEMPT (success or failure) so the dashboard can tell
 *  "checked 4 minutes ago, nothing new" apart from "the cron has been dead
 *  since Tuesday". Never throws: losing the log entry must not fail the poll
 *  that actually did the work. */
async function recordRun(supabase: any, row: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase.from('tscs_poll_runs').insert(row);
    if (error) console.error('[tscs-ingest] poll-run insert failed', error.message);
  } catch (e) {
    console.error('[tscs-ingest] poll-run insert threw', String(e));
  }
}

/** Tell a human when a message needs hands-on attention.
 *
 *  This is what makes the pipeline genuinely unattended: a needs-review row
 *  nobody looks at is a registration that silently never happens. Fires once
 *  per poll (a summary, never one mail per message), only for messages THIS
 *  poll could not read, and never on dry runs. Messages are marked \Seen once
 *  recorded, so a given problem email can only ever alert once — no nagging.
 *  Best-effort: a failed alert must not fail the poll that did the work. */
async function alertNeedsReview(count: number, source: string, origin: string): Promise<void> {
  try {
    const to = Deno.env.get('TSCS_ALERT_EMAIL') || 'admin@inheritedblooddisorders.world';
    const base = resolveOrigin(origin, Deno.env.get('PUBLIC_SITE_URL'));
    const link = base ? buildAppUrl(base, '/#/admin/india') : '';
    const noun = count === 1 ? 'registration email' : 'registration emails';
    // raw-html mode sends exactly what it is given, so the shell must be
    // applied here — otherwise the one email whose whole job is to get someone
    // to the review page arrives unstyled with an unclickable URL.
    const site = (Deno.env.get('SUPABASE_URL') || '').includes('gticuvgclbvhwvpzkuez') ? 'gansid' : 'scago';
    const body = plainTextToHtml(
      `${count} India ${noun} could not be read automatically and ${count === 1 ? 'is' : 'are'} waiting for review.\n\n` +
      `No one has been registered or ticketed for ${count === 1 ? 'it' : 'them'} yet — the payment is real, so this needs a human.\n\n` +
      (link ? `Review and finish: ${link}\n\n` : '') +
      `(poll source: ${source})`,
    );
    const html = renderEmailShell({
      content: link
        ? `${body}<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1E4A8C;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Open the review queue</a></p>`
        : body,
      site: site as any,
      subject: `${count} India ${noun} need review`,
    });
    const resp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        mode: 'raw-html',
        to,
        subject: `[GANSID] ${count} India ${noun} need review`,
        html,
      }),
    });
    if (!resp.ok) console.error('[tscs-ingest] needs-review alert failed', resp.status, await resp.text());
  } catch (e) {
    console.error('[tscs-ingest] needs-review alert threw', String(e));
  }
}

/** IMAP poll of the IONOS mailbox. */
async function pollMailbox(
  supabase: any,
  origin: string,
  dryRun: boolean,
  runCtx: { source: string; triggeredBy?: string | null },
): Promise<Response> {
  const startedAt = new Date().toISOString();
  // Alerting is bound to the messages ALREADY recorded, not to the poll
  // succeeding: anything written before a mid-run IMAP failure is already
  // \Seen and will never come back, so it must alert now or never.
  const maybeAlert = async (rs: readonly any[]) => {
    const n = rs.filter((r) => r?.status === 'needs-review').length;
    if (!dryRun && n > 0) await alertNeedsReview(n, runCtx.source, origin);
  };
  const host = Deno.env.get('TSCS_IMAP_HOST') || 'imap.ionos.com';
  const port = Number(Deno.env.get('TSCS_IMAP_PORT') || 993);
  const user = Deno.env.get('TSCS_IMAP_USER');
  const pass = Deno.env.get('TSCS_IMAP_PASS');
  const allowedSenders = Deno.env.get('TSCS_ALLOWED_SENDERS') || '@tscsindia.org';
  if (!user || !pass) {
    await recordRun(supabase, buildPollRunRow({
      startedAt, dryRun, ...runCtx, results: [], ok: false,
      error: 'TSCS_IMAP_USER / TSCS_IMAP_PASS not configured',
    }));
    return json({ error: 'TSCS_IMAP_USER / TSCS_IMAP_PASS not configured' }, 500);
  }

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
  let skipped = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // uid:true everywhere — sequence numbers shift if the mailbox mutates
      // mid-run (another client expunging), which would read or flag the
      // WRONG message. UIDs are stable for the mailbox's lifetime.
      // Narrow the search server-side when the allow-list is a single entry.
      // The mailbox is a person's WORKING inbox, so unrelated mail should not
      // even be fetched — and this stops a busy inbox consuming the per-run cap
      // before the partner's mail is reached.
      const allowEntries = allowedSenders.split(',').map((x) => x.trim()).filter(Boolean);
      const query: Record<string, unknown> = { seen: false };
      if (allowEntries.length === 1) query.from = allowEntries[0].replace(/^@/, '');
      const unseen = await client.search(query as any, { uid: true });
      const uids: number[] = (unseen || []).slice(0, 25); // bounded per run
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
        if (!msg?.source) continue;
        const parsedMail = await simpleParser(msg.source);
        const fromAddr = parsedMail.from?.value?.[0]?.address || msg.envelope?.from?.[0]?.address || '';
        const messageId = (parsedMail.messageId || msg.envelope?.messageId || `uid-${uid}-${host}`).slice(0, 250);
        const subject = parsedMail.subject || msg.envelope?.subject || '';
        const receivedAt = (parsedMail.date || new Date()).toISOString();

        let outcomeRow: any = { message_id: messageId, from_addr: fromAddr, subject, received_at: receivedAt };

        if (!senderAllowed(fromAddr, allowedSenders)) {
          // NOT the partner's: leave it completely alone — unread, unrecorded,
          // unflagged. This mailbox belongs to a person, and silently marking
          // their mail read (a cancellation request, a sponsor thread) is a
          // worse failure than any parsing bug. Counted, never consumed.
          skipped++;
          continue;
        }
        {
          const parsed = parseTscsEmail({ subject, text: parsedMail.text || '', html: typeof parsedMail.html === 'string' ? parsedMail.html : '' });
          if (!parsed.ok) {
            outcomeRow = {
              ...outcomeRow,
              status: 'needs-review',
              raw: parsedMail.text || String(parsedMail.html || ''),
              error: parsed.reason,
            };
          } else if (paymentStateOf({ subject, text: parsedMail.text || '', html: typeof parsedMail.html === 'string' ? parsedMail.html : '', paymentId: parsed.registration.payment_id }) === 'pending') {
            // TSCS mails an "[PENDING] Incomplete Registration" notice for
            // abandoned checkouts that is structurally identical to a real
            // confirmation. Registering one hands a congress ticket to someone
            // who never paid, so it is filed, not ingested — and not alerted
            // on, because an abandoned checkout is a non-event, not a problem.
            outcomeRow = {
              ...outcomeRow,
              status: 'ignored',
              parsed: parsed.registration,
              raw: parsedMail.text || String(parsedMail.html || ''),
              error: 'TSCS pending notice — checkout was not completed, nothing to register',
            };
          } else if (paymentStateOf({ subject, text: parsedMail.text || '', html: typeof parsedMail.html === 'string' ? parsedMail.html : '', paymentId: parsed.registration.payment_id }) === 'unknown') {
            // Parsed fine but carries no transaction id and no payment-confirmed
            // marker. Could be a template change; could be another non-payment
            // notice. Either way a human decides — never auto-register.
            outcomeRow = {
              ...outcomeRow,
              status: 'needs-review',
              parsed: parsed.registration,
              raw: parsedMail.text || String(parsedMail.html || ''),
              error: 'no transaction id and no payment-confirmed marker — do not register without checking with TSCS',
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
          if (outcomeRow.status === 'error') {
            // A transient failure (e.g. a momentary DB error on the attendee
            // insert) must NOT consume the message: leave it unseen and
            // unrecorded so the next poll retries it from scratch.
            recorded = 'left unseen for retry';
          } else {
            recorded = await recordEmail(supabase, outcomeRow);
            if (recorded !== 'error') {
              // Mark seen only after the audit row exists — an unseen message
              // is the retry mechanism.
              await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
            }
          }
        }
        results.push({
          messageId,
          from: fromAddr,
          status: outcomeRow.status,
          recorded,
          attendeeId: outcomeRow.attendee_id ?? null,
          error: outcomeRow.error ?? null,
          // Dry runs are the rehearsal tool: show what WOULD be ingested so
          // parse quality can be verified against real emails without writing
          // anything. Bounded preview; only the secret-holder ever sees this.
          ...(dryRun
            ? {
                subject,
                parsed: outcomeRow.parsed ?? null,
                rawPreview: (parsedMail.text || String(parsedMail.html || '')).slice(0, 1500),
              }
            : {}),
        });
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try { await client.logout(); } catch { /* already gone */ }
    await maybeAlert(results);
    await recordRun(supabase, buildPollRunRow({
      startedAt, dryRun, ...runCtx, results, ok: false,
      error: `IMAP poll failed: ${String(e)}`,
    }));
    return json({ error: `IMAP poll failed: ${String(e)}`, processed: results }, 502);
  }
  await maybeAlert(results);
  await recordRun(supabase, buildPollRunRow({ startedAt, dryRun, ...runCtx, results, ok: true }));
  return json({ ok: true, processed: results.length, skipped, results, dryRun });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // AUTH — two accepted callers, deliberately additive:
  //   1. the shared secret (GitHub Actions cron, CLI) — it has no Supabase
  //      session, so it cannot use a JWT;
  //   2. an admin's Supabase JWT (the dashboard's India Registrations page) —
  //      admins must never be handed the shared secret just to press a button.
  // verify_jwt is false for this function, so the gateway validates nothing;
  // getUser() below is what actually proves the token.
  const secret = Deno.env.get('TSCS_INGEST_SECRET');
  const presented = req.headers.get('x-ingest-secret');
  let caller: { kind: 'secret' | 'admin'; source: string; email: string | null } | null = null;

  if (secret && presented === secret) {
    caller = { kind: 'secret', source: 'manual', email: null };
  } else {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (jwt) {
      const { data: userData } = await supabase.auth.getUser(jwt);
      if (userData?.user) {
        const { data: profile } = await supabase
          .from('profiles').select('role, admin_permissions').eq('id', userData.user.id).maybeSingle();
        const role = (profile as any)?.role ?? '';
        if (role === 'admin' || role === 'super_admin') {
          // Mirror the UI gate server-side. A plain admin whose dashboard page
          // is switched off is blocked in the sidebar but could otherwise POST
          // here with their own session and create paid attendee rows.
          // NULL permissions means legacy grandfather = full access, matching
          // FALLBACK_ADMIN_PERMISSIONS in utils/adminPermissions.ts.
          const perms = (profile as any)?.admin_permissions;
          const allowed = role === 'super_admin' || perms == null || perms?.pages?.dashboard === true;
          if (!allowed) return json({ error: 'forbidden — dashboard access required' }, 403);
          caller = { kind: 'admin', source: 'dashboard', email: userData.user.email ?? null };
        } else {
          // A real session that simply isn't an admin — say so rather than
          // pretending the credential was unreadable.
          return json({ error: 'forbidden — admin only' }, 403);
        }
      }
    }
  }
  if (!caller) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const mode = String(body?.mode || '');
  const origin = (req.headers.get('origin') || '').toLowerCase();

  // Secret callers self-declare where they came from so the run log can tell
  // the scheduled cron apart from a one-off curl. Allow-listed, never free text.
  if (caller.kind === 'secret') {
    caller.source = String(body?.source || '').toLowerCase() === 'cron' ? 'cron' : 'manual';
  }

  if (mode === 'health') {
    return json({
      ok: true,
      imapConfigured: !!(Deno.env.get('TSCS_IMAP_USER') && Deno.env.get('TSCS_IMAP_PASS')),
      formId: TSCS_FORM_ID,
      allowedSenders: Deno.env.get('TSCS_ALLOWED_SENDERS') || '@tscsindia.org',
    });
  }

  if (mode === 'poll') {
    return await pollMailbox(supabase, origin, body?.dryRun === true, {
      source: caller.source,
      triggeredBy: caller.email,
    });
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

  // Triage without ingesting: park a message an admin has judged not to be a
  // real registration (a partner test payment, a duplicate), or reopen one
  // that was parked by mistake. Never touches attendees — status only.
  if (mode === 'dismiss') {
    const messageId = String(body?.messageId || '');
    const next = String(body?.status || 'ignored');
    if (!messageId) return json({ error: 'messageId required' }, 400);
    if (next !== 'ignored' && next !== 'needs-review') {
      return json({ error: "status must be 'ignored' or 'needs-review'" }, 400);
    }
    const { data: current } = await supabase
      .from('tscs_email_registrations')
      .select('status, attendee_id').eq('message_id', messageId).maybeSingle();
    if (!current) return json({ error: 'no such message' }, 404);
    // A message that already produced a registration must not be re-labelled:
    // the attendee is live and ticketed, there is no transition back to
    // 'ingested', and the queue would then misreport a real registration.
    if ((current as any).attendee_id || (current as any).status === 'ingested') {
      return json({ error: 'this message already created a registration — it cannot be set aside' }, 409);
    }
    // Preserve the parse-failure reason unless the admin supplies their own
    // note: it is the only surviving record of WHY a human was needed, and the
    // message is already \Seen so it can never be re-read.
    const patch: Record<string, unknown> = { status: next };
    if (body?.note) patch.error = String(body.note).slice(0, 500);
    const { error } = await supabase.from('tscs_email_registrations')
      .update(patch).eq('message_id', messageId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, messageId, status: next, by: caller.email });
  }

  return json({ error: `unknown mode: ${mode || '(none)'}` }, 400);
});
