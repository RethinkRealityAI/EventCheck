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
          headerGradient: 'linear-gradient(135deg, #ba0028 0%, #E0243C 55%, #2260a1 100%)',
          footerGradient: 'linear-gradient(135deg, #ba0028 0%, #E0243C 60%, #2260a1 100%)',
          buttonColor: '#ba0028',
          brandLabel: "GANSID '26",
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
    return { transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
    }), smtpUser, fromName };
}

/**
 * Send a simple HTML email (no attachments).
 * Reads SMTP config from environment variables.
 */
async function sendSimpleEmail({ to, subject, html, smtpConfig }: { to: string; subject: string; html: string; smtpConfig?: any }) {
    const { transporter, smtpUser, fromName } = buildTransporter(smtpConfig);
    await transporter.sendMail({
        from: `"${fromName}" <${smtpUser}>`,
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
            const { transporter, smtpUser, fromName } = buildTransporter(smtpConfig);
            await transporter.sendMail({
                from: `"${fromName}" <${smtpUser}>`,
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
            const { transporter, smtpUser, fromName } = buildTransporter(smtpConfig);
            const attachments = (body.attachments || []).map((att: { filename: string; content: string; contentType?: string }) => ({
                filename: att.filename,
                content: att.content,
                encoding: 'base64',
                contentType: att.contentType || 'application/pdf',
            }));
            await transporter.sendMail({
                from: `"${fromName}" <${smtpUser}>`,
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
            } catch (e) {
                console.warn('Failed to send exhibitor-staff ticket email', e);
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

            // Stamp `last_ticket_email_at` on the staff attendee so the
            // dashboard reflects that we sent them their confirmation.
            // Best-effort — the email was already sent successfully.
            try {
                await supabase
                    .from('attendees')
                    .update({ last_ticket_email_at: new Date().toISOString() })
                    .eq('id', staff.id);
            } catch (stampErr) {
                console.warn('Failed to stamp last_ticket_email_at on exhibitor-staff-claim-completed', stampErr);
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
            from: `"${fromName}" <${smtpConfig.user}>`,
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
