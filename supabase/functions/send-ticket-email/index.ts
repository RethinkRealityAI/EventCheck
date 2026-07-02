// @ts-nocheck
// Follow this to deploy: https://supabase.com/docs/guides/functions
// supabase functions deploy send-ticket-email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: Record<string, any>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/**
 * Branded HTML email shell — must match the visual language of
 * utils/emailShell.ts in the browser so admin previews and real sends look
 * identical. `fromName` is used as a coarse site-key signal (any name
 * containing "GANSID" gets the tri-stop gradient; else SCAGO red).
 */
function generateEmailTemplate(data: {
    title: string;
    greeting: string;
    content: string;
    attachmentNote?: string;
    fromName?: string;
}) {
    const rawName = (data.fromName && data.fromName.trim()) ? data.fromName : 'SCAGO';
    const isGansid = /gansid/i.test(rawName);
    const palette = isGansid
      ? {
          headerGradient: 'linear-gradient(135deg, #ba0028 0%, #E0243C 38%, #2260a1 100%)',
          footerGradient: 'linear-gradient(135deg, #ba0028 0%, #E0243C 42%, #2260a1 100%)',
          buttonColor: '#ba0028',
          brandLabel: 'GANSID Congress 2026',
          subtitle: 'Hyderabad, India · October 23–25, 2026',
          contactEmail: 'congress@inheritedblooddisorders.world',
        }
      : {
          headerGradient: 'linear-gradient(135deg, #B3282D 0%, #8B1F24 100%)',
          footerGradient: 'linear-gradient(135deg, #B3282D 0%, #8B1F24 100%)',
          buttonColor: '#B3282D',
          brandLabel: 'SCAGO',
          subtitle: 'Sickle Cell Awareness Group of Ontario',
          contactEmail: 'info@scago.ca',
        };

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; color: #1a1c1c; }
    .container { max-width: 560px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${palette.headerGradient}; padding: 44px 32px 40px; text-align: center; color: white; }
    .header-title { font-size: 26px; font-weight: 800; letter-spacing: 1px; color: white; text-transform: uppercase; margin: 0; }
    .header-subtitle { font-size: 13px; color: rgba(255,255,255,0.9); margin-top: 8px; }
    .body { padding: 40px 32px; }
    .body h1, .body h2, .body h3 { color: #1a1c1c; margin: 0 0 16px; line-height: 1.2; }
    .body p { font-size: 16px; line-height: 1.6; color: #1a1c1c; opacity: 0.85; margin: 0 0 20px; }
    .body a { color: ${palette.buttonColor}; }
    .greeting { font-size: 18px; font-weight: 600; color: #1a1a2e; margin: 0 0 20px; }
    .attachment-callout { margin-top: 24px; background: rgba(0,0,0,0.03); border-radius: 10px; padding: 14px 18px; font-size: 14px; color: #4b5563; border-left: 3px solid ${palette.buttonColor}; }
    .footer { padding: 28px 32px; background: ${palette.footerGradient}; text-align: center; font-size: 12px; color: rgba(255,255,255,0.92); }
    .footer a { color: white; text-decoration: underline; }
    .footer-brand { font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: white; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">${data.title}</div>
      <div class="header-subtitle">${palette.subtitle}</div>
    </div>
    <div class="body">
      <p class="greeting">${data.greeting},</p>
      ${data.content}
      ${data.attachmentNote ? `<div class="attachment-callout">📎 ${data.attachmentNote}</div>` : ''}
    </div>
    <div class="footer">
      <div class="footer-brand">${palette.brandLabel}</div>
      Questions? <a href="mailto:${palette.contactEmail}">${palette.contactEmail}</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Build a transporter from environment variables (or fallback to smtpConfig).
 */
function buildTransporter(smtpConfig?: any) {
    const smtpHost = Deno.env.get('SMTP_HOST') || smtpConfig?.host || 'smtp.ionos.com';
    const smtpPort = Number(Deno.env.get('SMTP_PORT') || smtpConfig?.port || 587);
    const smtpUser = Deno.env.get('SMTP_USER') || smtpConfig?.user;
    const smtpPass = Deno.env.get('SMTP_PASS') || smtpConfig?.pass;
    const fromName = (smtpConfig?.fromName && String(smtpConfig.fromName).trim())
      || Deno.env.get('SMTP_FROM_NAME')
      || 'SCAGO';
    // Header/envelope From address. IONOS uses the SMTP login as the sender, but
    // providers like Resend authenticate with a fixed username ("resend") that is
    // NOT a valid From address, so the sender must be decoupled from the login.
    // Falls back to smtpUser when SMTP_FROM is unset → identical behaviour on the
    // current IONOS setup; setting SMTP_FROM flips the sender with no code change.
    const fromAddress = (smtpConfig?.from && String(smtpConfig.from).trim())
      || Deno.env.get('SMTP_FROM')
      || smtpUser;
    return { transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
    }), smtpUser, fromName, fromAddress };
}

/**
 * Send a simple HTML email (no attachments).
 * Reads SMTP config from environment variables.
 */
async function sendSimpleEmail({ to, subject, html, smtpConfig }: { to: string; subject: string; html: string; smtpConfig?: any }) {
    const { transporter, fromName, fromAddress } = buildTransporter(smtpConfig);
    await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html,
    });
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();

        // ── RAW HTML: send a fully pre-rendered email with no extra templating ──
        // Used by admin tools (SendUserEmailModal) that generate their own branded
        // HTML (header image, gradient footer, tracking pixel, etc.) and must NOT be
        // wrapped by generateEmailTemplate — doing so double-wraps the doc and
        // destroys the layout.
        // Body shape: { mode: 'raw-html', to, subject, html, smtpConfig?, fromEmail? }
        if (body.mode === 'raw-html') {
            const { to, subject, html, smtpConfig } = body;
            if (!to || !subject || !html) {
                return jsonResponse({ error: 'Missing to/subject/html' }, 400);
            }
            const { transporter, fromName, fromAddress } = buildTransporter(smtpConfig);
            await transporter.sendMail({
                from: `"${fromName}" <${fromAddress}>`,
                to,
                subject,
                html,
            });
            return jsonResponse({ ok: true });
        }

        // ── GROUP INVITE: send registration-completion link to a pending-claim guest ──
        // Uses admin-configurable Template Y from app_settings.email_guest_claim_*.
        // Placeholders supported: {{name}}, {{purchaser}}, {{event}}, {{complete_url}}, {{signup_url}}
        if (body.mode === 'group-invite') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: guest, error: gErr } = await supabase
                .from('attendees').select('*').eq('id', body.attendeeId).maybeSingle();
            if (gErr || !guest) return jsonResponse({ error: 'Guest not found' }, 404);

            const { data: primary } = await supabase
                .from('attendees').select('name, email').eq('id', guest.primary_attendee_id).maybeSingle();

            const { data: form } = await supabase
                .from('forms').select('title').eq('id', guest.form_id).maybeSingle();
            const eventName = form?.title || 'the event';

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'SCAGO' }
                : undefined;

            const origin = body.origin || '';
            const completeUrl = `${origin}/#/form/${guest.form_id}?ref=${guest.id}`;
            const signupUrl = `${origin}/#/`;

            const rawSubject = (appSettings as any)?.email_guest_claim_subject || 'Complete your registration for {{event}}';
            const rawBody = (appSettings as any)?.email_guest_claim_body || `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has purchased your ticket for <strong>{{event}}</strong>. Your ticket is attached and will be fully confirmed once you complete a few personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account with this same email so you can view your ticket and updates anytime: <a href="{{signup_url}}">{{signup_url}}</a></p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, guest.name || 'there')
                .replace(/\{\{purchaser\}\}/g, primary?.name || 'A colleague')
                .replace(/\{\{event\}\}/g, eventName)
                .replace(/\{\{complete_url\}\}/g, completeUrl)
                .replace(/\{\{signup_url\}\}/g, signupUrl);
            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${guest.name || 'there'}`,
                content: body_html,
                fromName: smtpConfig?.fromName,
            });

            await sendSimpleEmail({ to: guest.email, subject, html, smtpConfig });
            return jsonResponse({ ok: true });
        }

        // ── CONTACT REGISTER INVITE: emails an imported contact a FREE registration link ──
        // Body: { mode: 'contact-register-invite', to, subject, html }  (html pre-rendered by caller)
        if (body.mode === 'contact-register-invite') {
            const { to, subject, html } = body;
            if (!to || !subject || !html) return jsonResponse({ error: 'Missing to/subject/html' }, 400);
            const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
            const { data: appSettings } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
            const s = (appSettings as any) || {};
            const smtpConfig = appSettings
                ? { host: s.smtp_host, port: Number(s.smtp_port || 587), user: s.smtp_user, pass: s.smtp_pass, fromName: s.email_from_name || 'SCAGO' }
                : undefined;
            await sendSimpleEmail({ to, subject, html, smtpConfig });
            return jsonResponse({ ok: true });
        }

        // ── REGISTRATION CONFIRMED: server-guaranteed purchaser confirmation + download link ──
        // No attachments. Reuses the admin purchaser template (table-purchaser variant
        // when linked guests exist, otherwise the standard ticket template) and appends a
        // download-link block. Fired by verify-payment after every event-path insert so
        // the buyer's confirmation survives a tab-close after PayPal.
        // Body shape: { mode: 'registration-confirmed', primaryAttendeeId, downloadUrl }
        if (body.mode === 'registration-confirmed') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: primary, error: pErr } = await supabase
                .from('attendees').select('*').eq('id', body.primaryAttendeeId).maybeSingle();
            if (pErr || !primary) return jsonResponse({ error: 'Primary not found' }, 404);
            if (!primary.email) return jsonResponse({ ok: true, skipped: 'no-email' });
            // Don't email a confirmation for test registrations.
            if (primary.is_test === true) return jsonResponse({ ok: true, skipped: 'test' });

            const { data: form } = await supabase
                .from('forms').select('title').eq('id', primary.form_id).maybeSingle();
            const eventName = form?.title || 'the event';

            // Table/group purchaser? Pick the table-purchaser template if linked guests exist.
            const { count: guestCount } = await supabase
                .from('attendees').select('id', { count: 'exact', head: true })
                .eq('primary_attendee_id', primary.id);
            const isTableOrGroup = (guestCount ?? 0) > 0;

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const s = (appSettings as any) || {};
            const smtpConfig = appSettings
                ? { host: s.smtp_host, port: Number(s.smtp_port || 587), user: s.smtp_user, pass: s.smtp_pass, fromName: s.email_from_name || 'SCAGO' }
                : undefined;

            // Column names reconciled against storageService AppSettings mapper:
            //   email_subject / email_body_template (standard purchaser),
            //   email_table_purchaser_subject / email_table_purchaser_body (table/group).
            const rawSubject = (isTableOrGroup ? s.email_table_purchaser_subject : s.email_subject)
                || s.email_subject || 'Your registration for {{event}} is confirmed';
            const rawBody = (isTableOrGroup ? s.email_table_purchaser_body : s.email_body_template)
                || s.email_body_template || '<p>Thank you for registering for <strong>{{event}}</strong>.</p>';

            const downloadUrl = body.downloadUrl || '';
            const downloadBlock = downloadUrl
                ? `<div style="margin-top:20px;padding:16px 18px;background:#f0f7ff;border-left:3px solid #1E4A8C;border-radius:6px;">
                     <p style="margin:0 0 10px;font-weight:600;">Your tickets</p>
                     <p style="margin:0 0 12px;font-size:14px;color:#475569;">Download your ticket(s) — including any guests — using the button below. Keep this email; the link stays valid through the event.</p>
                     <p style="text-align:center;margin:8px 0;"><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Download your tickets</a></p>
                   </div>`
                : '';

            const replace = (str: string) => str
                .replace(/\{\{event\}\}/g, eventName)
                .replace(/\{\{name\}\}/g, primary.name || '')
                .replace(/\{\{id\}\}/g, primary.id || '')
                .replace(/\{\{invoiceId\}\}/g, primary.invoice_id || '')
                .replace(/\{\{amount\}\}/g, primary.payment_amount || '')
                .replace(/\{\{download_url\}\}/g, downloadUrl);

            const subject = replace(rawSubject);
            const contentHtml = replace(rawBody) + downloadBlock;
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${primary.name || 'there'}`,
                content: contentHtml,
                fromName: smtpConfig?.fromName,
            });

            await sendSimpleEmail({ to: primary.email, subject, html, smtpConfig });

            // Stamp send time (best-effort; rowcount not critical for a metadata stamp).
            await supabase.from('attendees')
                .update({ last_ticket_email_at: new Date().toISOString() })
                .eq('id', primary.id);

            return jsonResponse({ ok: true });
        }

        // ── GUEST CLAIM COMPLETED: send ticket to the now-claimed guest + notify primary ──
        // Reads admin-configurable templates from app_settings.email_guest_confirmed_*
        // with placeholders {{name}} {{event}} {{purchaser}} {{registration_id}} {{qr_image_url}}.
        if (body.mode === 'guest-claim-completed') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: attendee, error: aErr } = await supabase
                .from('attendees')
                .select('*')
                .eq('id', body.attendeeId)
                .maybeSingle();
            if (aErr || !attendee) return jsonResponse({ error: 'Attendee not found' }, 404);

            const { data: form } = await supabase
                .from('forms')
                .select('title')
                .eq('id', attendee.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the event';

            // Pull SMTP + fromName from admin-configurable app_settings so a
            // credential rotation in Settings propagates to this mode instead of
            // silently falling back to stale env vars.
            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'SCAGO' }
                : undefined;

            // 1. Send a personal ticket confirmation to the claimed guest.
            let ticketOk = true;
            try {
                const qrData = attendee.qr_payload || attendee.id;
                const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrData)}`;

                const rawSubject = (appSettings as any)?.email_guest_confirmed_subject
                    || 'Your registration for {{event}} is confirmed';
                const rawBody = (appSettings as any)?.email_guest_confirmed_body
                    || `<p>Thank you for completing your registration for <strong>{{event}}</strong>!</p><p>Your check-in QR code is below. Present this email at the entrance — the team will scan it.</p><div style="text-align:center;margin:24px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="240" height="240" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div><p style="color:#666;font-size:13px;">Registration ID: {{registration_id}}</p>`;

                const replace = (s: string) => s
                    .replace(/\{\{name\}\}/g, attendee.name || 'there')
                    .replace(/\{\{event\}\}/g, eventName)
                    .replace(/\{\{registration_id\}\}/g, attendee.id)
                    .replace(/\{\{qr_image_url\}\}/g, qrImageUrl);

                const subject = replace(rawSubject);
                const body_html = replace(rawBody);
                const html = generateEmailTemplate({
                    title: eventName,
                    greeting: `Hi ${attendee.name || 'there'}`,
                    content: body_html,
                    fromName: smtpConfig?.fromName,
                });
                await sendSimpleEmail({ to: attendee.email, subject, html, smtpConfig });
            } catch (e) {
                console.warn('Failed to send personal ticket on claim-completion', e);
                ticketOk = false;
            }

            // 2. Notify the primary (best-effort)
            if (attendee.primary_attendee_id) {
                const { data: primary } = await supabase
                    .from('attendees')
                    .select('name, email')
                    .eq('id', attendee.primary_attendee_id)
                    .maybeSingle();
                if (primary?.email) {
                    // Admin-editable notification template. Falls back to a
                    // sensible default when the admin hasn't customised it.
                    const notifyRawSubject = (appSettings as any)?.email_guest_completion_notify_subject
                        || '{{name}} has completed their registration for {{event}}';
                    const notifyRawBody = (appSettings as any)?.email_guest_completion_notify_body
                        || `<p>Hi {{purchaser}},</p><p><strong>{{name}}</strong> has completed their registration details for <strong>{{event}}</strong>. Their individual ticket confirmation has been emailed to them directly — no action needed from you.</p>`;
                    const notifyReplace = (s: string) => s
                        .replace(/\{\{name\}\}/g, attendee.name || 'Guest')
                        .replace(/\{\{purchaser\}\}/g, primary.name || 'there')
                        .replace(/\{\{event\}\}/g, eventName);
                    const subject = notifyReplace(notifyRawSubject);
                    const html = generateEmailTemplate({
                        title: eventName,
                        greeting: `Hi ${primary.name || 'there'}`,
                        content: notifyReplace(notifyRawBody),
                        fromName: smtpConfig?.fromName,
                    });
                    await sendSimpleEmail({ to: primary.email, subject, html, smtpConfig })
                        .catch(e => console.warn('Primary notification failed', e));
                }
            }

            // Stamp `last_ticket_email_at` so the dashboard reflects "Sent"
            // for self-claimed guests. Best-effort — the email already went
            // out; this is just bookkeeping.
            if (ticketOk) {
                try {
                    await supabase
                        .from('attendees')
                        .update({ last_ticket_email_at: new Date().toISOString() })
                        .eq('id', attendee.id);
                } catch (stampErr) {
                    console.warn('Failed to stamp last_ticket_email_at on guest-claim-completed', stampErr);
                }
            }

            return jsonResponse({ ok: ticketOk });
        }

        // ── STAFF INVITE (sponsor_exhibitor combined form): send registration-completion link
        //    to a staff member. Two call patterns:
        //      1) Pre-composed: caller supplies (to, name, purchaser, orgName, category,
        //         completeUrl, signupUrl, eventName). Used by PublicSponsorExhibitorForm
        //         and PortalDashboard at submit/fill-in time when they already have all
        //         the org context loaded.
        //      2) Hydrate-from-attendeeId: caller supplies only `attendeeId` (+ optional
        //         `origin`). Used by the admin "Resend invitation" action in
        //         ExhibitorsTab where the client only has the staff row's id. We fetch
        //         the staff row, primary org, and form server-side and compose the
        //         claim URL as `${origin}/#/form/<staff.form_id>?ref=<staff.id>`.
        //    Either way, the completeUrl MUST point at the public registration form
        //    (`/#/form/<formId>?ref=<id>`) so PublicRegistration's pending-claim
        //    handler can pre-fill the staff member's name/email/category. Pointing at
        //    `/` (root) would land them on the GANSID portal Landing/signup page.
        //    Uses admin-configurable template from app_settings.email_staff_invite_{subject,body}.
        //    Placeholders: {{name}} {{purchaser}} {{org_name}} {{category}} {{complete_url}}
        //                  {{signup_url}} {{event}}
        //    NO attachments — attachment callout is suppressed. ──
        if (body.mode === 'staff-invite') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            // Hydrate any missing fields from the staff attendee row when the
            // caller supplied an attendeeId (admin "Resend" path). Fields the
            // caller passes explicitly always take precedence.
            let to = body.to as string | undefined;
            let name = body.name as string | undefined;
            let purchaser = body.purchaser as string | undefined;
            let orgName = body.orgName as string | undefined;
            let category = body.category as string | undefined;
            let completeUrl = body.completeUrl as string | undefined;
            let signupUrl = body.signupUrl as string | undefined;
            let eventName = body.eventName as string | undefined;

            const needsHydration = !to || !completeUrl || !name;
            if (needsHydration && body.attendeeId) {
                const { data: staff } = await supabase
                    .from('attendees')
                    .select('*')
                    .eq('id', body.attendeeId)
                    .maybeSingle();
                if (!staff) return jsonResponse({ error: 'Staff member not found' }, 404);

                const { data: org } = staff.primary_attendee_id
                    ? await supabase
                        .from('attendees')
                        .select('company_info, name')
                        .eq('id', staff.primary_attendee_id)
                        .maybeSingle()
                    : { data: null } as any;
                const { data: form } = await supabase
                    .from('forms')
                    .select('title')
                    .eq('id', staff.form_id)
                    .maybeSingle();

                const origin = body.origin || '';
                const staffCategory = (staff.answers as any)?.staffCategory;
                const categoryLabel =
                    staffCategory === 'hall_only' ? 'Hall-Only'
                    : staffCategory === 'full_access' ? 'Full-Access'
                    : staffCategory === 'full_congress' ? 'Full Congress'
                    : 'Staff';

                if (!to) to = staff.email;
                if (!name) name = staff.name || 'there';
                // Prefer the contact person's name (company_info.contactName) over
                // the primary attendee's `name` column. For sponsor_exhibitor primaries
                // verify-payment writes `name: org.orgName` (the organization name),
                // so falling back to `org.name` first would produce emails reading
                // "Acme Corp has registered you for the Congress" instead of
                // "John Smith has registered you for the Congress".
                if (!purchaser) purchaser = (org?.company_info as any)?.contactName || org?.name || 'A colleague';
                if (!orgName) orgName = (org?.company_info as any)?.orgName || '';
                if (!category) category = categoryLabel;
                if (!completeUrl) completeUrl = `${origin}/#/form/${staff.form_id}?ref=${staff.id}`;
                if (!signupUrl) signupUrl = `${origin}/#/`;
                if (!eventName) eventName = form?.title || 'the event';
            }

            if (!to) return jsonResponse({ error: 'staff-invite: missing recipient (to/attendeeId)' }, 400);
            if (!completeUrl) return jsonResponse({ error: 'staff-invite: missing completeUrl (and could not derive from attendeeId)' }, 400);
            // completeUrl must be absolute — relative URLs render as dead links in
            // email clients. This catches a missing `body.origin` in the hydrate path
            // before we silently send a broken invitation.
            if (!/^https?:\/\//i.test(completeUrl)) {
                return jsonResponse({ error: `staff-invite: completeUrl must be absolute (got: ${completeUrl}). Caller must supply body.origin or a fully-qualified completeUrl.` }, 400);
            }

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const rawSubject = (appSettings as any)?.email_staff_invite_subject
                || 'Complete your registration for {{event}}';
            const rawBody = (appSettings as any)?.email_staff_invite_body
                || `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered you for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong> ({{category}}).</p><p>Please complete your personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account: <a href="{{signup_url}}">{{signup_url}}</a></p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, name || 'there')
                .replace(/\{\{purchaser\}\}/g, purchaser || 'A colleague')
                .replace(/\{\{org_name\}\}/g, orgName || '')
                .replace(/\{\{category\}\}/g, category || '')
                .replace(/\{\{complete_url\}\}/g, completeUrl || '')
                .replace(/\{\{signup_url\}\}/g, signupUrl || '')
                .replace(/\{\{event\}\}/g, eventName || 'the event');

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName || 'the event',
                greeting: `Hi ${name || 'there'}`,
                content: body_html,
                // No attachments — suppress the callout.
                fromName: smtpConfig?.fromName,
            });

            await sendSimpleEmail({ to, subject, html, smtpConfig });
            return jsonResponse({ ok: true });
        }

        // ── STAFF CLAIM COMPLETED (sponsor_exhibitor combined form): send ticket to the
        //    now-claimed staff member. Caller supplies pre-composed fields (to, name,
        //    orgName, eventName, attachments). Uses app_settings.email_staff_confirmed_*.
        //    Supports PDF attachments (base64) — attachment callout shown when present. ──
        if (body.mode === 'staff-claim-completed') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const rawSubject = (appSettings as any)?.email_staff_confirmed_subject
                || 'Your registration for {{event}} is confirmed';
            const rawBody = (appSettings as any)?.email_staff_confirmed_body
                || `<p>Hi {{name}},</p><p>Thank you for completing your registration for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong>!</p><p>Your ticket is attached. Please bring it (or the QR code) to the event for check-in.</p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, body.name || 'there')
                .replace(/\{\{org_name\}\}/g, body.orgName || '')
                .replace(/\{\{event\}\}/g, body.eventName || 'the event');

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
            const html = generateEmailTemplate({
                title: body.eventName || 'the event',
                greeting: `Hi ${body.name || 'there'}`,
                content: body_html,
                attachmentNote: hasAttachments ? 'Attachment included — please review the PDF.' : undefined,
                fromName: smtpConfig?.fromName,
            });

            // Use the transporter directly so we can include attachments.
            const { transporter, fromName, fromAddress } = buildTransporter(smtpConfig);
            const attachments = (body.attachments || []).map((att: { filename: string; content: string; contentType?: string }) => ({
                filename: att.filename,
                content: att.content,
                encoding: 'base64',
                contentType: att.contentType || 'application/pdf',
            }));
            await transporter.sendMail({
                from: `"${fromName}" <${fromAddress}>`,
                to: body.to,
                subject,
                html,
                attachments,
            });
            // Stamp `last_ticket_email_at` when the caller supplies an
            // attendeeId. The current shape doesn't require it (callers
            // pass pre-composed fields), so we treat it as optional —
            // sponsor/exhibitor flow can be updated to pass it for full
            // dashboard coverage.
            if (body.attendeeId) {
                try {
                    await supabase
                        .from('attendees')
                        .update({ last_ticket_email_at: new Date().toISOString() })
                        .eq('id', body.attendeeId);
                } catch (stampErr) {
                    console.warn('Failed to stamp last_ticket_email_at on staff-claim-completed', stampErr);
                }
            }
            return jsonResponse({ ok: true });
        }

        // ── EXHIBITOR STAFF INVITE: send registration-completion link to an exhibitor staff member ──
        // Shares admin-configurable app_settings.email_staff_invite_* templates with the
        // sponsor_exhibitor combined flow — the two flows are functionally identical,
        // so operators edit a single template in Settings → Email templates.
        if (body.mode === 'exhibitor-staff-invite') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: staff, error: sErr } = await supabase
                .from('attendees')
                .select('*')
                .eq('id', body.attendeeId)
                .maybeSingle();
            if (sErr || !staff) return jsonResponse({ error: 'Staff member not found' }, 404);
            // Placeholder staff rows are inserted with `email: ''` when the
            // exhibitor doesn't yet know their staff's contacts. Sending to
            // an empty `to` either errors silently or delivers to nobody;
            // either way the slot stays unclaimed forever. Refuse fast so
            // the caller can prompt the org to fill in details first.
            if (!staff.email || !String(staff.email).trim()) {
                return jsonResponse({
                    error: `Staff row ${staff.id} has no email — cannot send invite. Add an email and retry.`,
                }, 400);
            }

            const { data: org } = await supabase
                .from('attendees')
                .select('company_info, email, name')
                .eq('id', staff.primary_attendee_id)
                .maybeSingle();

            const { data: form } = await supabase
                .from('forms')
                .select('title')
                .eq('id', staff.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the GANSID Congress';
            const orgName = (org?.company_info as any)?.orgName || 'your organization';
            // Prefer the contact person's name (company_info.contactName) over the
            // primary attendee's `name` column — see staff-invite branch above for rationale.
            const purchaser = (org?.company_info as any)?.contactName || org?.name || 'the organization';

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const origin = body.origin || '';
            const registrationLink = `${origin}/#/form/${staff.form_id}?ref=${staff.id}`;
            const signupUrl = `${origin}/#/`;

            const rawSubject = (appSettings as any)?.email_staff_invite_subject
                || 'Complete your registration for {{event}}';
            const rawBody = (appSettings as any)?.email_staff_invite_body
                || `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered you for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong> ({{category}}).</p><p>Please complete your personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account: <a href="{{signup_url}}">{{signup_url}}</a></p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, staff.name || 'there')
                .replace(/\{\{purchaser\}\}/g, purchaser)
                .replace(/\{\{org_name\}\}/g, orgName)
                .replace(/\{\{category\}\}/g, 'Exhibitor staff')
                .replace(/\{\{complete_url\}\}/g, registrationLink)
                .replace(/\{\{signup_url\}\}/g, signupUrl)
                .replace(/\{\{event\}\}/g, eventName);

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${staff.name || 'there'}`,
                content: body_html,
                fromName: smtpConfig?.fromName,
            });

            await sendSimpleEmail({ to: staff.email, subject, html, smtpConfig });
            return jsonResponse({ ok: true });
        }

        // ── EXHIBITOR STAFF CLAIM COMPLETED: send ticket to claimed staff + notify org contact ──
        // Uses the same email_staff_confirmed_* admin templates as the sponsor_exhibitor flow.
        if (body.mode === 'exhibitor-staff-claim-completed') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: staff, error: sErr } = await supabase
                .from('attendees')
                .select('*')
                .eq('id', body.attendeeId)
                .maybeSingle();
            if (sErr || !staff) return jsonResponse({ error: 'Staff not found' }, 404);

            const { data: form } = await supabase
                .from('forms')
                .select('title')
                .eq('id', staff.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the GANSID Congress';

            const { data: org } = staff.primary_attendee_id
                ? await supabase
                    .from('attendees')
                    .select('company_info, email')
                    .eq('id', staff.primary_attendee_id)
                    .maybeSingle()
                : { data: null } as any;
            const orgName = (org?.company_info as any)?.orgName || 'your organization';

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const rawSubject = (appSettings as any)?.email_staff_confirmed_subject
                || 'Your registration for {{event}} is confirmed';
            const rawBody = (appSettings as any)?.email_staff_confirmed_body
                || `<p>Hi {{name}},</p><p>Thank you for completing your registration for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong>!</p><p>You are all set. Please bring this confirmation (or the QR code on your ticket) to the event for check-in.</p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, staff.name || 'there')
                .replace(/\{\{org_name\}\}/g, orgName)
                .replace(/\{\{event\}\}/g, eventName);

            // 1. Send personal ticket confirmation to the staff member
            // We track success so we can gate the `last_ticket_email_at`
            // stamp below — stamping unconditionally on a failed send is
            // exactly the silent-failure that hid the Sherrie James bug
            // (dashboard said "Sent" while no email actually went out).
            let staffTicketEmailSent = false;
            if (!staff.email || !String(staff.email).trim()) {
                console.error('exhibitor-staff-claim-completed: staff has no email', { staffId: staff.id });
            } else {
                try {
                    const subject = replace(rawSubject);
                    const body_html = replace(rawBody);
                    const html = generateEmailTemplate({
                        title: eventName,
                        greeting: `Hi ${staff.name || 'there'}`,
                        content: body_html,
                        fromName: smtpConfig?.fromName,
                    });
                    await sendSimpleEmail({ to: staff.email, subject, html, smtpConfig });
                    staffTicketEmailSent = true;
                } catch (e) {
                    console.warn('Failed to send exhibitor-staff ticket email', e);
                }
            }

            // 2. Notify the org contact (best-effort). Pulls from the
            //    admin-editable notification template so the wording can be
            //    customised in Settings → Email Templates.
            if (org?.email) {
                const contactName = (org?.company_info as any)?.contactName || 'there';
                const notifyRawSubject = (appSettings as any)?.email_exhibitor_staff_completion_notify_subject
                    || '{{name}} has completed their registration';
                const notifyRawBody = (appSettings as any)?.email_exhibitor_staff_completion_notify_body
                    || `<p>Hi {{contact_name}},</p><p><strong>{{name}}</strong> has completed their registration details for the <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong>.</p><p>Their individual ticket confirmation has been emailed to them directly.</p>`;
                const notifyReplace = (s: string) => s
                    .replace(/\{\{name\}\}/g, staff.name || 'Staff member')
                    .replace(/\{\{contact_name\}\}/g, contactName)
                    .replace(/\{\{org_name\}\}/g, orgName || '')
                    .replace(/\{\{event\}\}/g, eventName);
                const subject = notifyReplace(notifyRawSubject);
                const html = generateEmailTemplate({
                    title: eventName,
                    greeting: `Hi ${contactName}`,
                    content: notifyReplace(notifyRawBody),
                    fromName: smtpConfig?.fromName,
                });
                await sendSimpleEmail({ to: org.email, subject, html, smtpConfig })
                    .catch(e => console.warn('Org contact notification failed', e));
            }

            // Only stamp `last_ticket_email_at` if the staff ticket email
            // actually went out. Otherwise the dashboard would lie that
            // the ticket was delivered, making operators believe the
            // attendee is informed when they aren't.
            if (staffTicketEmailSent) {
                try {
                    await supabase
                        .from('attendees')
                        .update({ last_ticket_email_at: new Date().toISOString() })
                        .eq('id', staff.id);
                } catch (stampErr) {
                    console.warn('Failed to stamp last_ticket_email_at on exhibitor-staff-claim-completed', stampErr);
                }
            }

            return jsonResponse({ ok: staffTicketEmailSent, staffTicketEmailSent });
        }

        // ── BOGO: shared helper to load app_settings + smtp config + form + payer ──
        // All four BOGO modes share the same lookup pattern.
        async function loadBogoContext(supabase: any, attendeeId: string) {
            const { data: free } = await supabase
                .from('attendees').select('*').eq('id', attendeeId).maybeSingle();
            if (!free) return null;
            const { data: source } = free.bogo_source_attendee_id
                ? await supabase
                    .from('attendees').select('id, name, email')
                    .eq('id', free.bogo_source_attendee_id).maybeSingle()
                : { data: null };
            const { data: form } = await supabase
                .from('forms').select('title').eq('id', free.form_id).maybeSingle();
            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;
            return { free, source, form, appSettings, smtpConfig };
        }

        const BOGO_ADMIN_CONTACT = 'admin@inheritedblooddisorders.world';

        // ── BOGO TICKET: send QR ticket to a free guest (inline mode at checkout,
        //    or post-claim of a claim-link). Template defaults are baked in but
        //    admin can override via app_settings.email_bogo_ticket_subject/body.
        if (body.mode === 'bogo-ticket') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const ctx = await loadBogoContext(supabase, body.attendeeId);
            if (!ctx) return jsonResponse({ error: 'Free attendee not found' }, 404);
            const { free, source, form, appSettings, smtpConfig } = ctx;
            if (!free.email) return jsonResponse({ error: 'Free attendee has no email' }, 400);

            const eventName = form?.title || 'the event';
            const origin = body.origin || '';
            const signupUrl = `${origin}/#/`;
            const qrData = free.qr_payload || free.id;
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrData)}`;

            const rawSubject = (appSettings as any)?.email_bogo_ticket_subject
                || '{{purchaser}} has sent you a free ticket to {{event}}';
            const rawBody = (appSettings as any)?.email_bogo_ticket_body
                || `<p>Hi {{name}},</p>
<p><strong>{{purchaser}}</strong> has gifted you a free ticket to <strong>{{event}}</strong>.</p>
<p>Your check-in QR code is below. Show it at the door.</p>
<div style="text-align:center;margin:24px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="240" height="240" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div>
<p style="color:#666;font-size:13px;">Registration ID: {{registration_id}}</p>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">This ticket is issued to your email address and cannot be transferred to another person. If you have questions or issues, contact <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>
<p style="margin-top:16px;font-size:14px;">Optional: <a href="{{signup_url}}">create a profile</a> to manage your ticket and access event resources.</p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, free.name || 'there')
                .replace(/\{\{purchaser\}\}/g, source?.name || 'A colleague')
                .replace(/\{\{event\}\}/g, eventName)
                .replace(/\{\{qr_image_url\}\}/g, qrImageUrl)
                .replace(/\{\{registration_id\}\}/g, free.id)
                .replace(/\{\{signup_url\}\}/g, signupUrl)
                .replace(/\{\{admin_contact\}\}/g, BOGO_ADMIN_CONTACT);

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${free.name || 'there'}`,
                content: body_html,
                fromName: smtpConfig?.fromName,
            });

            try {
                await sendSimpleEmail({ to: free.email, subject, html, smtpConfig });
                // Stamp last_ticket_email_at so dashboards show "Sent".
                await supabase.from('attendees')
                    .update({ last_ticket_email_at: new Date().toISOString() })
                    .eq('id', free.id);
            } catch (e) {
                console.error('bogo-ticket email failed', e);
                return jsonResponse({ error: 'Email send failed' }, 500);
            }
            return jsonResponse({ ok: true });
        }

        // ── BOGO CLAIM LINK: send the claim link to the PAYER (not the guest),
        //    who will forward it to whoever they'd like to bring. ──
        if (body.mode === 'bogo-claim-link') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const ctx = await loadBogoContext(supabase, body.attendeeId);
            if (!ctx) return jsonResponse({ error: 'Free attendee not found' }, 404);
            const { free, source, form, appSettings, smtpConfig } = ctx;
            const payerEmail = source?.email;
            if (!payerEmail) return jsonResponse({ error: 'Source attendee has no email' }, 400);

            const eventName = form?.title || 'the event';
            const origin = body.origin || '';
            const claimUrl = `${origin}/#/form/${free.form_id}?ref=${free.id}`;
            const portalTicketsUrl = `${origin}/#/portal/tickets`;

            const rawSubject = (appSettings as any)?.email_bogo_claim_link_subject
                || 'Your free guest claim link for {{event}}';
            const rawBody = (appSettings as any)?.email_bogo_claim_link_body
                || `<p>Hi {{payer_name}},</p>
<p>Your free guest claim link for <strong>{{event}}</strong> is ready.</p>
<p style="text-align:center;margin:24px 0;"><a href="{{claim_url}}" style="display:inline-block;padding:12px 24px;background:#ba0028;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Forward this claim link</a></p>
<p>Forward the link to the person you'd like to bring — they'll complete the short claim form and receive their ticket.</p>
<p>You can also manage this and your other tickets from your portal: <a href="{{portal_tickets_url}}">{{portal_tickets_url}}</a></p>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">Once your guest claims this ticket, the email they enter is locked to them. Make sure to forward this to the actual person attending. For issues, contact <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>`;

            const replace = (s: string) => s
                .replace(/\{\{payer_name\}\}/g, source?.name || 'there')
                .replace(/\{\{event\}\}/g, eventName)
                .replace(/\{\{claim_url\}\}/g, claimUrl)
                .replace(/\{\{portal_tickets_url\}\}/g, portalTicketsUrl)
                .replace(/\{\{admin_contact\}\}/g, BOGO_ADMIN_CONTACT);

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${source?.name || 'there'}`,
                content: body_html,
                fromName: smtpConfig?.fromName,
            });

            try {
                await sendSimpleEmail({ to: payerEmail, subject, html, smtpConfig });
            } catch (e) {
                console.error('bogo-claim-link email failed', e);
                return jsonResponse({ error: 'Email send failed' }, 500);
            }
            return jsonResponse({ ok: true });
        }

        // ── BOGO TICKET UPDATED: re-issue ticket to the free guest after the
        //    payer edited recipient details (uncommitted-only). ──
        if (body.mode === 'bogo-ticket-updated') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            const ctx = await loadBogoContext(supabase, body.attendeeId);
            if (!ctx) return jsonResponse({ error: 'Free attendee not found' }, 404);
            const { free, source, form, appSettings, smtpConfig } = ctx;
            if (!free.email) return jsonResponse({ error: 'Free attendee has no email' }, 400);

            const eventName = form?.title || 'the event';
            const qrData = free.qr_payload || free.id;
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrData)}`;

            const rawSubject = (appSettings as any)?.email_bogo_ticket_updated_subject
                || 'Your {{event}} ticket has been updated';
            const rawBody = (appSettings as any)?.email_bogo_ticket_updated_body
                || `<p>Hi {{name}},</p>
<p>Your ticket for <strong>{{event}}</strong> has been updated by <strong>{{purchaser}}</strong>. The latest version is below — please discard any earlier copies.</p>
<div style="text-align:center;margin:24px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="240" height="240" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">This ticket is issued to your email address and cannot be transferred. Questions? <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, free.name || 'there')
                .replace(/\{\{purchaser\}\}/g, source?.name || 'the buyer')
                .replace(/\{\{event\}\}/g, eventName)
                .replace(/\{\{qr_image_url\}\}/g, qrImageUrl)
                .replace(/\{\{admin_contact\}\}/g, BOGO_ADMIN_CONTACT);

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${free.name || 'there'}`,
                content: body_html,
                fromName: smtpConfig?.fromName,
            });

            try {
                await sendSimpleEmail({ to: free.email, subject, html, smtpConfig });
                await supabase.from('attendees')
                    .update({ last_ticket_email_at: new Date().toISOString() })
                    .eq('id', free.id);
            } catch (e) {
                console.error('bogo-ticket-updated email failed', e);
                return jsonResponse({ error: 'Email send failed' }, 500);
            }
            return jsonResponse({ ok: true });
        }

        // ── BOGO TICKET WITHDRAWN: notify the free guest that their gifted
        //    ticket has been withdrawn (because admin cancelled the paid
        //    source attendee). ──
        if (body.mode === 'bogo-ticket-withdrawn') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            // For withdrawn, the row may be about to be deleted — accept
            // a name+email+eventName payload directly so the caller can
            // capture before delete.
            const guestEmail = body.guestEmail || '';
            const guestName = body.guestName || 'there';
            const payerName = body.payerName || 'A colleague';
            const eventName = body.eventName || 'the event';
            if (!guestEmail) return jsonResponse({ error: 'guestEmail required' }, 400);

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const rawSubject = (appSettings as any)?.email_bogo_ticket_withdrawn_subject
                || 'Your free ticket to {{event}} has been withdrawn';
            const rawBody = (appSettings as any)?.email_bogo_ticket_withdrawn_body
                || `<p>Hi {{name}},</p>
<p>The free ticket <strong>{{purchaser}}</strong> sent you for <strong>{{event}}</strong> has been withdrawn. We're sorry for the inconvenience.</p>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">For questions or alternatives, please contact <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>`;

            const replace = (s: string) => s
                .replace(/\{\{name\}\}/g, guestName)
                .replace(/\{\{purchaser\}\}/g, payerName)
                .replace(/\{\{event\}\}/g, eventName)
                .replace(/\{\{admin_contact\}\}/g, BOGO_ADMIN_CONTACT);

            const subject = replace(rawSubject);
            const body_html = replace(rawBody);
            const html = generateEmailTemplate({
                title: eventName,
                greeting: `Hi ${guestName}`,
                content: body_html,
                fromName: smtpConfig?.fromName,
            });

            try {
                await sendSimpleEmail({ to: guestEmail, subject, html, smtpConfig });
            } catch (e) {
                console.error('bogo-ticket-withdrawn email failed', e);
                return jsonResponse({ error: 'Email send failed' }, 500);
            }
            return jsonResponse({ ok: true });
        }

        // ── DEFAULT FLOW: generic SMTP relay (original behaviour) ──
        const { smtpConfig, email } = body;

        const smtpHost = Deno.env.get('SMTP_HOST') || smtpConfig?.host || 'smtp.ionos.com';
        const smtpPort = Number(Deno.env.get('SMTP_PORT') || smtpConfig?.port || 587);
        const smtpUser = Deno.env.get('SMTP_USER') || smtpConfig?.user;
        const smtpPass = Deno.env.get('SMTP_PASS') || smtpConfig?.pass;
        const fromName = (smtpConfig?.fromName && String(smtpConfig.fromName).trim())
            || Deno.env.get('SMTP_FROM_NAME')
            || 'SCAGO';
        // Decouple sender from SMTP login (see buildTransporter) so Resend works;
        // falls back to smtpUser → unchanged for IONOS. This also fixes a latent
        // mismatch where the From used smtpConfig.user while auth used smtpUser.
        const fromAddress = (smtpConfig?.from && String(smtpConfig.from).trim())
            || Deno.env.get('SMTP_FROM')
            || smtpUser;

        if (!smtpUser || !smtpPass) {
            return new Response(
                JSON.stringify({ error: 'SMTP credentials are not configured.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true for 465, false for other ports
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        const hasAttachments = Array.isArray(email.attachments) && email.attachments.length > 0;
        // Use the caller-supplied banner title (typically the event name like
        // "Hope Gala") so the email header shows the actual event instead of
        // the generic "Event Registration" copy. Fall back when omitted so
        // older callers keep working.
        const bannerTitle = (typeof email.title === 'string' && email.title.trim())
            ? email.title.trim()
            : 'Event Registration';
        // Strip any HTML the caller already wrapped around the message so we
        // don't double-wrap with our own <p>. Detect by leading "<" — admin-
        // edited templates usually contain block-level tags already.
        const messageHtml = /^\s*<(p|div|h\d|table|ul|ol|blockquote|figure)/i.test(email.message)
            ? email.message
            : `<p>${email.message}</p>`;
        const html = generateEmailTemplate({
            title: bannerTitle,
            greeting: `Hello ${email.name}`,
            content: messageHtml,
            attachmentNote: hasAttachments ? 'Attachment included — please review the PDF.' : undefined,
            fromName,
        });

        // Nodemailer accepts base64 natively
        const attachments = (email.attachments || []).map((att: { filename: string; content: string; contentType?: string }) => ({
            filename: att.filename,
            content: att.content,
            encoding: 'base64',
            contentType: att.contentType || 'application/pdf',
        }));

        await transporter.sendMail({
            from: `"${fromName}" <${fromAddress}>`,
            to: email.to,
            subject: email.subject,
            html: html,
            attachments: attachments,
        });

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('send-ticket-email error:', message);
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
