// registration-complete — "complete your registration" for someone who is
// already registered but never answered all of our questions.
//
// Registrations reach the platform through doors that ask less than our form
// does: TSCS India's page never asks for dietary needs, accessibility, an
// emergency contact, or the three required consents; an admin comping a speaker
// fills in only what they know. Those people are ticketed, but the organisers
// are missing exactly what matters on the day, and nobody has agreed to the
// event terms. Until this existed there was no way to ask them: the `?ref=`
// claim flow only understands unclaimed guest seats, and pointed at a real
// registration it fell through to table-guest mode and offered a PAID form.
//
// Actions
//   resolve  (public, token)  — who this is, what we already have, what is
//                                still outstanding.
//   complete (public, token)  — accept answers to OUTSTANDING questions only.
//   link     (admin)          — mint a link for one attendee (Copy link).
//   send     (admin)          — email links to up to 25 attendees, logging each
//                                to email_sends with open/click tracking.
//
// Security model. The token (kind 'complete', see _shared/registrationToken.ts)
// is the credential and cannot be replayed as a download, pay or invite token.
// It can only ADD answers to unanswered questions that are neither the email
// (the account identity) nor a pricing input — _shared/registrationCompleteness
// .ts applyCompletion enforces that, and the same module decides what the page
// shows, so what is shown and what is validated cannot drift apart.
//
// AUTH: gateway-open (verify_jwt=false) because registrants have no session;
// `link` and `send` assert an admin/super_admin JWT themselves.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signCompleteToken, verifyCompleteToken } from '../_shared/registrationToken.ts';
import { buildAppUrl, resolveOrigin } from '../_shared/emailLinks.ts';
import { appendTrackingPixel, buildOpenPixelUrl, wrapClickUrl } from '../_shared/emailTracking.ts';
import { emailButtonStyle, renderEmailShell, type SiteKey } from '../_shared/emailShell.ts';
import {
  applyCompletion,
  assessCompleteness,
  displayValue,
  isAskableOnCompletion,
  type CompletenessField,
} from '../_shared/registrationCompleteness.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-supabase-client-platform / x-supabase-api-version are load-bearing: the
  // browser SDK sends them on the preflight (§18 CORS gotcha).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Must outlast the event, like every other link we email. */
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_BATCH = 25;

const PENDING_SEAT_TYPES = new Set(['pending-claim', 'staff-pending', 'exhibitor-staff-pending']);
const DELEGATE_TYPES = new Set(['staff-pending', 'staff-claimed', 'exhibitor-staff-pending', 'exhibitor-staff-claimed']);
const ORG_FORM_TYPES = new Set(['sponsor', 'exhibitor', 'sponsor_exhibitor']);

type Eligibility =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'pending-seat' | 'org-delegate' | 'org-booking' | 'no-form'; message: string };

/**
 * Who may be sent a completion link. Refused rows each already have their own
 * flow, and sending this one instead would ask them the wrong questions:
 *  - an unclaimed seat has no identity yet — it needs the claim link;
 *  - sponsor/exhibitor staff answer the staff form, which deliberately hides
 *    affiliation, presenting and emergency contact (the org supplies them);
 *  - an org's own booking is a sponsorship, not a person.
 */
function eligibility(row: any, form: any, parent: any): Eligibility {
  if (!row) return { ok: false, reason: 'not-found', message: 'Registration not found.' };
  if (!form) return { ok: false, reason: 'no-form', message: 'This registration has no form to complete.' };
  if (PENDING_SEAT_TYPES.has(row.guest_type) || /@placeholder\.invalid$/i.test(row.email || '')) {
    return { ok: false, reason: 'pending-seat', message: 'This seat has not been claimed yet — send its claim link instead.' };
  }
  if (DELEGATE_TYPES.has(row.guest_type) || (parent && (parent.sponsor_tier || parent.exhibitor_booth_type))) {
    return { ok: false, reason: 'org-delegate', message: 'This person was registered by their organisation and completes the staff form instead.' };
  }
  if (ORG_FORM_TYPES.has(form.form_type)) {
    return { ok: false, reason: 'org-booking', message: 'Sponsor and exhibitor bookings are not completed this way.' };
  }
  return { ok: true };
}

/** Only what the page needs — never ticket config, pricing or internal keys. */
function publicField(f: any): CompletenessField {
  return {
    id: f.id, type: f.type, label: f.label, required: !!f.required,
    options: f.options, placeholder: f.placeholder, usedForPricing: !!f.usedForPricing,
    conditional: f.conditional, linkText: f.linkText, consentModal: f.consentModal,
  };
}

function siteKey(): SiteKey {
  return (Deno.env.get('SUPABASE_URL') || '').includes('gticuvgclbvhwvpzkuez') ? 'gansid' : 'scago';
}

async function loadRegistration(svc: any, attendeeId: string) {
  const { data: row } = await svc.from('attendees').select('*').eq('id', attendeeId).maybeSingle();
  if (!row) return { row: null, form: null, parent: null };
  const [{ data: form }, parentRes] = await Promise.all([
    svc.from('forms').select('id, title, fields, form_type').eq('id', row.form_id).maybeSingle(),
    row.primary_attendee_id
      ? svc.from('attendees').select('id, sponsor_tier, exhibitor_booth_type').eq('id', row.primary_attendee_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { row, form, parent: parentRes?.data ?? null };
}

function fieldsOf(form: any): CompletenessField[] {
  return (Array.isArray(form?.fields) ? form.fields : []).map(publicField);
}

function firstName(row: any): string {
  const f = typeof row.answers?.f_fname === 'string' ? row.answers.f_fname.trim() : '';
  if (f && f.length > 1) return f;
  return String(row.name || '').trim().split(/\s+/)[0] || 'there';
}

/** The label a registrant should read. Consent labels are split around their
 *  link text on the form ("I have read and agree to the" + "Terms"). */
function readableLabel(f: CompletenessField): string {
  return [f.label, f.linkText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function assertAdmin(req: Request, url: string, anonKey: string, svc: any): Promise<{ id: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return null;
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return null;
  const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['admin', 'super_admin'].includes((profile as any).role)) return null;
  return { id: user.id };
}

function renderCompletionEmail(args: {
  site: SiteKey; row: any; eventName: string; link: string; outstanding: CompletenessField[]; consents: number;
}): { subject: string; html: string } {
  const { site, row, eventName, link, outstanding, consents } = args;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const questions = outstanding.filter(f => f.type !== 'boolean');
  const items = questions.slice(0, 8).map(f => `<li>${esc(readableLabel(f))}</li>`).join('');
  const more = questions.length > 8 ? `<li>and ${questions.length - 8} more</li>` : '';
  const consentLine = consents > 0
    ? `<li>Your agreement to the event${consents === 1 ? '’s policy' : '’s terms and policies'}</li>`
    : '';
  const subject = `A few details for ${eventName}`;
  const content = `
<h2>A few details to complete your registration</h2>
<p>Hello ${esc(firstName(row))},</p>
<p>You are registered for <strong>${esc(eventName)}</strong>. There are a few things we still need from you
that we were not able to collect when you registered — it takes about two minutes.</p>
<ul>${items}${more}${consentLine}</ul>
<p style="text-align:center;"><a href="${link}" class="button" style="${emailButtonStyle(site)}">Complete my registration</a></p>
<p style="font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">If the button does not work, copy this link into your browser:<br>
<a href="${link}" style="color:#ba0028;">${link}</a></p>
<p style="font-size:13px;opacity:0.7;">This does not change your registration or your ticket. The link is personal to you — please do not forward it.</p>`;
  return { subject, html: renderEmailShell({ content, site, subject }) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    // ── Public, token-gated ────────────────────────────────────────────────
    if (action === 'resolve' || action === 'complete') {
      const verified = await verifyCompleteToken(String(body?.token || ''), serviceKey, Date.now());
      if (!verified.valid) {
        return json({
          error: verified.reason === 'expired' ? 'expired' : 'invalid',
          message: verified.reason === 'expired'
            ? 'This link has expired. Please contact the organisers for a new one.'
            : 'This link is not valid. Please use the link from your email.',
        }, 400);
      }

      const { row, form, parent } = await loadRegistration(svc, verified.attendeeId);
      const ok = eligibility(row, form, parent);
      if (!ok.ok) return json({ error: ok.reason, message: ok.message }, 409);

      const fields = fieldsOf(form);
      const stored: Record<string, unknown> = { ...(row.answers ?? {}) };

      if (action === 'resolve') {
        const report = assessCompleteness(fields, stored);
        // Only answers to questions the form defines, never internal keys
        // (tscs_*, _asked_fields, QA markers) — this reaches a public page.
        const formIds = new Set(fields.map(f => f.id));
        const answers = Object.fromEntries(Object.entries(stored).filter(([k]) => formIds.has(k)));
        return json({
          ok: true,
          site: siteKey(),
          eventName: form.title || 'the event',
          attendee: { firstName: firstName(row), name: row.name, email: row.email },
          complete: report.complete,
          completedAt: stored._completed_at ?? null,
          // Every askable field: the page re-evaluates visibility locally as
          // answers change, so a conditional question can appear in place.
          fields: fields.filter(isAskableOnCompletion),
          outstandingIds: report.outstanding.map(f => f.id),
          answers,
          summary: report.answered.map(f => ({ label: readableLabel(f), value: displayValue(f, stored[f.id]) })),
        });
      }

      const submitted = body?.answers && typeof body.answers === 'object' ? body.answers : {};
      const result = applyCompletion(fields, stored, submitted, new Date().toISOString());
      if (!result.ok) return json({ error: 'validation', message: result.error, fieldId: result.fieldId }, 422);

      const { error: upErr } = await svc.from('attendees').update({ answers: result.answers }).eq('id', row.id);
      if (upErr) return json({ error: 'save-failed', message: 'We could not save your answers. Please try again.' }, 500);
      return json({ ok: true, complete: result.report.complete });
    }

    // ── Admin ──────────────────────────────────────────────────────────────
    if (action === 'link' || action === 'send') {
      const admin = await assertAdmin(req, url, anonKey, svc);
      if (!admin) return json({ error: 'forbidden' }, 403);

      const origin = resolveOrigin(body?.origin, req.headers.get('origin'), Deno.env.get('PUBLIC_SITE_URL'));
      if (!origin) return json({ error: 'origin must be an absolute http(s) URL (or set PUBLIC_SITE_URL)' }, 400);

      const mintLink = async (attendeeId: string) => {
        const token = await signCompleteToken(attendeeId, serviceKey, Date.now(), TTL_MS);
        return buildAppUrl(origin, `/#/complete?token=${encodeURIComponent(token)}`);
      };

      if (action === 'link') {
        const attendeeId = String(body?.attendeeId || '');
        const { row, form, parent } = await loadRegistration(svc, attendeeId);
        const ok = eligibility(row, form, parent);
        if (!ok.ok) return json({ error: ok.reason, message: ok.message }, 409);
        return json({ ok: true, url: await mintLink(attendeeId) });
      }

      const ids: string[] = Array.isArray(body?.attendeeIds)
        ? [...new Set((body.attendeeIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x))]
        : [];
      if (ids.length === 0) return json({ error: 'attendeeIds required' }, 400);
      if (ids.length > MAX_BATCH) return json({ error: `at most ${MAX_BATCH} per request` }, 400);
      const force = body?.force === true;
      const site = siteKey();

      const results: Array<{ attendeeId: string; status: 'sent' | 'skipped' | 'failed'; reason?: string; email?: string }> = [];
      let stopped = false;

      for (const attendeeId of ids) {
        if (stopped) { results.push({ attendeeId, status: 'skipped', reason: 'quota' }); continue; }
        const { row, form, parent } = await loadRegistration(svc, attendeeId);
        const ok = eligibility(row, form, parent);
        if (!ok.ok) { results.push({ attendeeId, status: 'skipped', reason: ok.reason }); continue; }
        if (row.is_test) { results.push({ attendeeId, status: 'skipped', reason: 'test-row', email: row.email }); continue; }

        const fields = fieldsOf(form);
        const report = assessCompleteness(fields, row.answers ?? {});
        if (report.complete && !force) {
          results.push({ attendeeId, status: 'skipped', reason: 'already-complete', email: row.email });
          continue;
        }

        const trackingId = crypto.randomUUID();
        const link = wrapClickUrl(url, trackingId, await mintLink(attendeeId));
        const eventName = form.title || 'the event';
        const rendered = renderCompletionEmail({
          site, row, eventName, link,
          outstanding: report.outstanding, consents: report.consentsMissing.length,
        });
        const html = appendTrackingPixel(rendered.html, buildOpenPixelUrl(url, trackingId));

        const resp = await fetch(`${url}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ mode: 'raw-html', to: row.email, subject: rendered.subject, html }),
        });
        if (!resp.ok) {
          const detail = (await resp.text()).slice(0, 300);
          results.push({ attendeeId, status: 'failed', reason: detail || `HTTP ${resp.status}`, email: row.email });
          // A spent daily quota fails every later send the same way — stop
          // rather than burn through the batch reporting one failure per row.
          if (/quota|rate limit|too many/i.test(detail)) stopped = true;
          continue;
        }

        // Logged like every other admin send, so the "Last email" column and
        // open/click tracking cover completion links too.
        await svc.from('email_sends').insert({
          tracking_id: trackingId,
          recipient_email: row.email,
          recipient_user_id: row.user_id ?? null,
          recipient_attendee_id: row.id,
          subject: rendered.subject,
          template_key: 'complete-registration',
          form_id: row.form_id,
          event_name: eventName,
          sent_by: admin.id,
          metadata: {
            outstanding: report.outstanding.map(f => f.id),
            consents_missing: report.consentsMissing.length,
          },
        });
        results.push({ attendeeId, status: 'sent', email: row.email });
      }

      return json({ ok: true, results });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error('[registration-complete]', String(e));
    return json({ error: 'server-error' }, 500);
  }
});
