// Follow this to deploy: https://supabase.com/docs/guides/functions
// supabase functions deploy send-ticket-email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';
import { renderEmailShell, applyPlaceholders } from '../_shared/emailShell.ts';
import { resolveEmailTemplate } from '../_shared/emailTemplates.ts';
import { buildAppUrl, isAbsoluteHttpUrl, resolveOrigin } from '../_shared/emailLinks.ts';
import { buildOpenPixelUrl, appendTrackingPixel } from '../_shared/emailTracking.ts';
import { buildQrImageUrl, fetchQrPng, inlineQrSrc, qrAttachments } from '../_shared/qrEmbed.ts';
import { HEADER_LOGO_CID, fetchRemoteImage, inlineImageSrc, inlineAttachmentEntry } from '../_shared/imageEmbed.ts';
import { ensureTicketBlocks, prependReissueNotice, attachmentNoteFor } from '../_shared/ticketBlock.ts';
import { buildEmailFailureRow } from '../_shared/emailFailure.ts';
import { jsPDF } from 'npm:jspdf@2.5.1';
import { drawTicketPdf, ticketFromAttendeeRow, ticketPdfFilename, bytesToBase64 } from '../_shared/ticketPdf.ts';
import { resolveAttendeeDisplayName } from '../_shared/attendeeDisplayName.ts';
import { guessImageContentType, isFetchableImageUrl } from '../_shared/imageEmbed.ts';
import { signRegistrationToken } from '../_shared/registrationToken.ts';

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
 * The origin every link in this send is built from: what the caller passed,
 * else the request's own Origin header, else the project's PUBLIC_SITE_URL.
 * Returns '' only when none of the three is an absolute http(s) URL.
 *
 * Callers used to reach for `body.origin || ''` individually, which shipped
 * relative hrefs — dead buttons in an inbox — whenever Origin was stripped.
 */
function sendOrigin(body: any, req: Request): string {
    return resolveOrigin(
        body?.origin,
        req.headers.get('origin'),
        Deno.env.get('PUBLIC_SITE_URL'),
    );
}

/**
 * For sends whose entire purpose is the link (invitations, claim links): refuse
 * rather than deliver an email the recipient can't act on. The 400 surfaces to
 * the admin who triggered it and lands in the function logs; a link-less invite
 * would surface days later as "I never got a link".
 */
function missingOriginResponse(mode: string) {
    console.error(`[send-ticket-email ${mode}] no absolute origin — refusing to send a link-less email`, JSON.stringify({
        hasPublicSiteUrl: !!Deno.env.get('PUBLIC_SITE_URL'),
    }));
    return jsonResponse({
        error: `${mode}: could not build an absolute link. Pass body.origin, or set the PUBLIC_SITE_URL secret on this project.`,
    }, 400);
}

/**
 * Adapter kept for call-site compatibility. Delegates to the ONE shared shell
 * (_shared/emailShell.ts — also re-exported to the client as utils/emailShell.ts)
 * so admin previews and real sends are byte-identical. Notes:
 *  - The template body owns its own greeting ("Hello {{name}},"); we no longer
 *    inject a separate greeting line (that caused a double greeting and a look
 *    the preview never showed). `greeting` is accepted but ignored.
 *  - `headerImageUrl` renders the branded banner; omit → wordmark fallback.
 *  - Site detection: the project ref in SUPABASE_URL is deterministic per tenant
 *    (gticuvgclbvhwvpzkuez = GANSID, iigbgbgakevcgilucvbs = SCAGO). The legacy
 *    /gansid/i-on-fromName heuristic stays only as a last-resort fallback — an
 *    admin renaming email_from_name must NOT flip the palette.
 */
function generateEmailTemplate(data: {
    title: string;
    greeting?: string;
    content: string;
    attachmentNote?: string;
    fromName?: string;
    headerImageUrl?: string;
    footerText?: string;
    /** When set, the rendered shell carries a track-email open pixel. */
    trackingId?: string;
}) {
    const projectUrl = Deno.env.get('SUPABASE_URL') || '';
    const site = projectUrl.includes('gticuvgclbvhwvpzkuez') ? 'gansid'
        : projectUrl.includes('iigbgbgakevcgilucvbs') ? 'scago'
        : (/gansid/i.test((data.fromName && data.fromName.trim()) || 'SCAGO') ? 'gansid' : 'scago');
    const attachHtml = data.attachmentNote
        ? `<div style="margin-top:24px;background:rgba(0,0,0,0.03);border-radius:10px;padding:14px 18px;font-size:14px;color:#4b5563;">📎 ${data.attachmentNote}</div>`
        : '';
    return renderEmailShell({
        site,
        content: data.content + attachHtml,
        headerImageUrl: data.headerImageUrl && data.headerImageUrl.trim() ? data.headerImageUrl : undefined,
        footerText: data.footerText && data.footerText.trim() ? data.footerText : undefined,
        // Open tracking. Any caller passing `trackingId` gets the 1×1 pixel in
        // the rendered shell, so server-originated sends (issued tickets,
        // invites) report opens like client-rendered campaigns do.
        trackingPixelUrl: data.trackingId
            ? buildOpenPixelUrl(Deno.env.get('SUPABASE_URL') || '', data.trackingId)
            : undefined,
    });
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
async function sendSimpleEmail({ to, subject, html, smtpConfig, attachments, headerImageUrl }: { to: string; subject: string; html: string; smtpConfig?: any; attachments?: any[]; headerImageUrl?: string }) {
    const { transporter, fromName, fromAddress } = buildTransporter(smtpConfig);
    // Inline the branded header logo as cid: as well. It is a hotlinked remote
    // image, so corporate gateways blank it by default — and that empty box is
    // what the Novartis recipient mistook for their missing QR code
    // (2026-08-18). Best-effort: a fetch failure leaves the remote <img> in
    // place, which is exactly the previous behaviour.
    let finalHtml = html;
    const finalAttachments: any[] = attachments ? [...attachments] : [];
    if (headerImageUrl) {
        const logo = await fetchRemoteImage(headerImageUrl, HEADER_LOGO_CID, 'email-header.png');
        if (logo) {
            finalHtml = inlineImageSrc(finalHtml, headerImageUrl, HEADER_LOGO_CID);
            finalAttachments.push(inlineAttachmentEntry(logo));
        }
    }
    await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html: finalHtml,
        // Inline (cid:) attachments — the check-in QR rides here rather than as
        // a hotlinked remote image, which most clients block by default.
        ...(finalAttachments.length ? { attachments: finalAttachments } : {}),
    });
}

/**
 * Resolve a QR into (html, attachments) for a ticket email.
 *
 * Rewrites the remote QR URL in the rendered HTML to `cid:` and returns the
 * PNG as an inline attachment. Falls back to leaving the remote <img> in place
 * if the PNG can't be fetched, so a QR outage can never block a ticket.
 */
async function embedQrForEmail(html: string, qrData: string, remoteUrl: string, includeDownloadCopy = true): Promise<{ html: string; attachments: any[] }> {
    const qr = await fetchQrPng(qrData);
    if (!qr) return { html, attachments: [] };
    // Inline copy (what the HTML shows) PLUS, by default, a separately
    // downloadable copy so a guest whose client strips images entirely still
    // holds a scannable file. When a full branded ticket PDF is attached the
    // loose PNG is just clutter — the PDF is the presentable artefact — so
    // callers pass includeDownloadCopy=false.
    const attachments = includeDownloadCopy ? qrAttachments(qr) : [inlineAttachmentEntry(qr)];
    return { html: inlineQrSrc(html, remoteUrl), attachments };
}

// ── Server-side branded ticket PDF ───────────────────────────────────────────
// Long assumed impossible (jsPDF is browser-oriented), re-tested 2026-08-18:
// npm:jspdf bundles through --use-api and runs in the edge runtime. That lets
// every server-initiated send attach the SAME ticket the /#/tickets page
// produces, instead of a bare QR PNG that scans but looks like a screenshot.
// Caches the BRANDING images only (logo, background) — those repeat on every
// ticket and are the expensive fetch. QR URLs are unique per attendee and
// single-use, so caching them would grow this map by one entry per ticket ever
// sent from a warm isolate. Bounded regardless, as a backstop.
const pdfImageCache = new Map<string, string>();
const PDF_IMAGE_CACHE_MAX = 8;

function isSingleUseImage(src: string): boolean {
    return src.includes('api.qrserver.com');
}

async function edgeToDataUrl(src: string | undefined): Promise<string | undefined> {
    if (!src) return undefined;
    if (src.startsWith('data:')) return src;
    // Relative paths (e.g. '/branding/gansid/mark.svg') can't be fetched from
    // the edge — they only mean something in a browser on the site origin.
    if (!isFetchableImageUrl(src)) return undefined;
    const cacheable = !isSingleUseImage(src);
    if (cacheable) {
        const cached = pdfImageCache.get(src);
        if (cached) return cached;
    }
    try {
        const resp = await fetch(src);
        if (!resp.ok) { console.error('[ticketPdf] image non-200', src, resp.status); return undefined; }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        if (!bytes.byteLength) return undefined;
        const ct = resp.headers.get('content-type') || guessImageContentType(src);
        const dataUrl = `data:${ct};base64,${bytesToBase64(bytes)}`;
        if (cacheable) {
            if (pdfImageCache.size >= PDF_IMAGE_CACHE_MAX) {
                const oldest = pdfImageCache.keys().next().value;
                if (oldest !== undefined) pdfImageCache.delete(oldest);
            }
            pdfImageCache.set(src, dataUrl);
        }
        return dataUrl;
    } catch (e) {
        console.error('[ticketPdf] image fetch failed', src, String(e));
        return undefined;
    }
}

/**
 * Build the branded ticket PDF as a base64 nodemailer attachment.
 *
 * Returns null on ANY failure so a PDF problem can never block the ticket
 * email — the inline QR and the download link still get the holder through
 * the door.
 */
async function buildTicketPdfAttachment(
    attendeeRow: any,
    formRow: any,
    appSettings: any,
    registrationUrl?: string,
): Promise<any | null> {
    try {
        if (!attendeeRow) return null;
        const ticket = ticketFromAttendeeRow(attendeeRow, formRow?.title);
        const settings = { pdfSettings: (appSettings?.pdf_settings || {}) as any };
        const form = {
            fields: (formRow?.fields || undefined) as any,
            pdfSettings: (formRow?.settings?.pdfSettings || undefined) as any,
        };
        const doc = new jsPDF();
        await drawTicketPdf(doc as any, ticket, settings, form, registrationUrl, { toDataUrl: edgeToDataUrl });
        const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
        return {
            filename: ticketPdfFilename(resolveAttendeeDisplayName(ticket, form)),
            content: bytesToBase64(bytes),
            encoding: 'base64',
            contentType: 'application/pdf',
        };
    } catch (e) {
        console.error('[ticketPdf] generation failed', String(e));
        return null;
    }
}

/**
 * Tokenised link to the public /#/tickets page, which rebuilds the full branded
 * ticket PDF in the browser. The third independent route to a ticket, after the
 * inline QR and the attached PNG — and the only one that still works if the
 * whole email is forwarded as plain text.
 *
 * Best-effort: any failure returns '' and the caller simply omits the block.
 */
async function buildTicketDownloadUrl(attendeeId: string, formId: string, origin: string): Promise<string> {
    try {
        if (!origin || !attendeeId || !formId) return '';
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const token = await signRegistrationToken(attendeeId, formId, serviceKey, Date.now(), 180 * 24 * 60 * 60 * 1000);
        return buildAppUrl(origin, `/#/tickets?token=${encodeURIComponent(token)}`);
    } catch (e) {
        console.error('[send-ticket-email] download token failed', String(e));
        return '';
    }
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Hoisted so the outer catch can attribute a failure to a recipient and a
    // mode. `body` is block-scoped to the try and is not reachable there.
    let failureCtx: {
        mode?: string; templateKey?: string; recipient?: string;
        formId?: string; attendeeId?: string; subject?: string;
    } = {};

    try {
        const body = await req.json();
        failureCtx = {
            mode: body?.mode,
            templateKey: body?.templateKey,
            recipient: body?.to ?? body?.email?.to,
            formId: body?.formId,
            attendeeId: body?.attendeeId ?? body?.primaryAttendeeId,
            subject: body?.subject ?? body?.email?.subject,
        };

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
            // Callers that render their own HTML usually embed the pixel
            // themselves; `trackingId` lets a caller that DIDN'T (admin
            // one-off sends) still get open tracking without re-rendering.
            const rawHtml = body.trackingId
                ? appendTrackingPixel(html, buildOpenPixelUrl(Deno.env.get('SUPABASE_URL') || '', String(body.trackingId)))
                : html;
            await transporter.sendMail({
                from: `"${fromName}" <${fromAddress}>`,
                to,
                subject,
                html: rawHtml,
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
                .from('forms').select('title, settings').eq('id', guest.form_id).maybeSingle();
            const eventName = form?.title || 'the event';
            const formEmailOverrides = (form as any)?.settings?.emailOverrides;

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'SCAGO' }
                : undefined;

            const origin = sendOrigin(body, req);
            if (!origin) return missingOriginResponse('group-invite');
            const completeUrl = buildAppUrl(origin, `/#/form/${guest.form_id}?ref=${guest.id}`);
            const signupUrl = buildAppUrl(origin, '/#/');

            const overrideOn = formEmailOverrides?.enabled === true;
            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['guest-claim'] : undefined,
                globalSubject: (appSettings as any)?.email_guest_claim_subject,
                globalBody: (appSettings as any)?.email_guest_claim_body,
                defaultSubject: 'Complete your registration for {{event}}',
                defaultBody: `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has purchased your ticket for <strong>{{event}}</strong>. Your ticket is attached and will be fully confirmed once you complete a few personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account with this same email so you can view your ticket and updates anytime: <a href="{{signup_url}}">{{signup_url}}</a></p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                name: guest.name || 'there',
                purchaser: primary?.name || 'A colleague',
                event: eventName,
                complete_url: completeUrl,
                signup_url: signupUrl,
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = applyPlaceholders(tpl.body, vars, body.mode);
            const html = generateEmailTemplate({
                title: eventName,
                content: body_html,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            await sendSimpleEmail({ to: guest.email, subject, html, smtpConfig, headerImageUrl: tpl.headerImageUrl });
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
            // `tpl` does NOT exist in this scope — this mode receives pre-composed
            // html from the caller. Reading the header logo straight from settings.
            await sendSimpleEmail({ to, subject, html, smtpConfig, headerImageUrl: s.email_header_logo });
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
                .from('forms').select('title, settings, fields').eq('id', primary.form_id).maybeSingle();
            const eventName = form?.title || 'the event';
            const formEmailOverrides = (form as any)?.settings?.emailOverrides;

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

            // Which template key? Table/group purchaser gets the table variant.
            const key = isTableOrGroup ? 'table-purchaser' : 'ticket';
            const overrideOn = formEmailOverrides?.enabled === true;
            const formOverride = overrideOn ? formEmailOverrides?.templates?.[key] : undefined;

            // Table/group purchasers historically fell back to the STANDARD template
            // when the table variant was empty — preserved via the inner ||.
            const tpl = resolveEmailTemplate({
                formOverride,
                globalSubject: isTableOrGroup ? (s.email_table_purchaser_subject || s.email_subject) : s.email_subject,
                globalBody: isTableOrGroup ? (s.email_table_purchaser_body || s.email_body_template) : s.email_body_template,
                defaultSubject: 'Your registration for {{event}} is confirmed',
                defaultBody: '<p>Hello {{name}},</p><p>Thank you for registering for <strong>{{event}}</strong>. Your registration is confirmed.</p>',
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: s.email_header_logo,
                globalFooterText: s.email_footer_text,
            });

            // A relative downloadUrl (caller had no origin) renders as a button
            // that does nothing from an inbox. Drop it to '' so the block is
            // omitted entirely, and log it — the confirmation itself is still
            // worth sending, and the recipient can re-request the ticket.
            const rawDownloadUrl = body.downloadUrl || '';
            if (rawDownloadUrl && !isAbsoluteHttpUrl(rawDownloadUrl)) {
                console.error('[send-ticket-email registration-confirmed] dropping non-absolute downloadUrl', JSON.stringify({
                    rawDownloadUrl, primaryAttendeeId: body.primaryAttendeeId,
                }));
            }
            const downloadUrl = isAbsoluteHttpUrl(rawDownloadUrl) ? rawDownloadUrl : '';
            const downloadBlock = downloadUrl
                ? `<div style="margin-top:20px;padding:16px 18px;background:#f0f7ff;border-left:3px solid #1E4A8C;border-radius:6px;">
                     <p style="margin:0 0 10px;font-weight:600;">Your tickets</p>
                     <p style="margin:0 0 12px;font-size:14px;color:#475569;">Download your ticket(s) — including any guests — using the button below. Keep this email; the link stays valid through the event.</p>
                     <p style="text-align:center;margin:8px 0;"><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Download your tickets</a></p>
                   </div>`
                : '';

            // This email is the highest-volume one we send — it fires on EVERY
            // registration — and its live template says "your ticket is attached
            // to this email" / "bring the attached PDF". Until now it attached
            // NOTHING and rendered no QR: the copy was simply false, and this
            // was the only ticket-bearing mode never given the treatment the
            // others got. It now carries the same three routes as the rest.
            const qrData = primary.qr_payload || primary.id;
            const qrImageUrl = buildQrImageUrl(qrData);
            const ticketPdf = await buildTicketPdfAttachment(primary, form, appSettings);
            const bodyTemplate = ensureTicketBlocks(tpl.body, {
                includeQr: true,
                attachmentNote: attachmentNoteFor(!!ticketPdf),
            });

            const vars = {
                event: eventName,
                name: primary.name || '',
                id: primary.id || '',
                invoiceId: primary.invoice_id || '',
                amount: primary.payment_amount || '',
                download_url: downloadUrl,
                registration_id: primary.id || '',
                qr_image_url: qrImageUrl,
                ticket_download_url: downloadUrl,
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const contentHtml = applyPlaceholders(bodyTemplate, vars, body.mode) + downloadBlock;
            const html = generateEmailTemplate({
                title: eventName,
                content: contentHtml,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
                trackingId: typeof body.trackingId === 'string' ? body.trackingId : undefined,
            });

            // The PDF here is the PURCHASER's own ticket. Guests are covered by
            // the download link — attaching N guest PDFs is what made the old
            // client-side table email hit provider size limits.
            const embedded = await embedQrForEmail(html, qrData, qrImageUrl, !ticketPdf);
            await sendSimpleEmail({
                to: primary.email,
                subject,
                html: embedded.html,
                smtpConfig,
                attachments: ticketPdf ? [...embedded.attachments, ticketPdf] : embedded.attachments,
                headerImageUrl: tpl.headerImageUrl,
            });

            // Stamp send time (best-effort; rowcount not critical for a metadata stamp).
            await supabase.from('attendees')
                .update({ last_ticket_email_at: new Date().toISOString() })
                .eq('id', primary.id);

            // Return the resolved subject so callers that log to `email_sends`
            // (contact-issue-ticket) record what was actually sent rather than
            // a guess.
            return jsonResponse({ ok: true, subject });
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
                .select('title, settings, fields')
                .eq('id', attendee.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the event';
            const formEmailOverrides = (form as any)?.settings?.emailOverrides;
            const overrideOn = formEmailOverrides?.enabled === true;

            // Pull SMTP + fromName from admin-configurable app_settings so a
            // credential rotation in Settings propagates to this mode instead of
            // silently falling back to stale env vars.
            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'SCAGO' }
                : undefined;

            // Fetch the purchaser up-front — the guest confirmation template references
            // {{purchaser}} (the live GANSID template does), and the notify send needs it too.
            let primary: { name: string | null; email: string | null } | null = null;
            if (attendee.primary_attendee_id) {
                const { data } = await supabase
                    .from('attendees')
                    .select('name, email')
                    .eq('id', attendee.primary_attendee_id)
                    .maybeSingle();
                primary = data;
            }

            // 1. Send a personal ticket confirmation to the claimed guest.
            let ticketOk = true;
            try {
                const qrData = attendee.qr_payload || attendee.id;
                const qrImageUrl = buildQrImageUrl(qrData);

                const tpl = resolveEmailTemplate({
                    formOverride: overrideOn ? formEmailOverrides?.templates?.['guest-confirmed'] : undefined,
                    globalSubject: (appSettings as any)?.email_guest_confirmed_subject,
                    globalBody: (appSettings as any)?.email_guest_confirmed_body,
                    defaultSubject: 'Your registration for {{event}} is confirmed',
                    defaultBody: `<p>Hi {{name}},</p><p>Thank you for completing your registration for <strong>{{event}}</strong>!</p><p>Your check-in QR code is below. Present this email at the entrance — the team will scan it.</p><div style="text-align:center;margin:24px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="240" height="240" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div><p style="color:#666;font-size:13px;">Registration ID: {{registration_id}}</p>`,
                    formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                    globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                    globalFooterText: (appSettings as any)?.email_footer_text,
                });

                // Was PUBLIC_SITE_URL-only: if that secret was unset the portal
                // link silently rendered as an empty <a>, which is what "the
                // email arrived with no link" looked like. Now the caller's
                // origin and the request header back it up.
                const publicSiteUrl = sendOrigin(body, req);

                // Same three routes as the staff modes: branded PDF, inline
                // cid: QR, tokenised download link. Built BEFORE the copy so
                // the attachment note is accurate.
                const ticketPdf = await buildTicketPdfAttachment(attendee, form, appSettings);
                const downloadUrl = await buildTicketDownloadUrl(attendee.id, attendee.form_id, publicSiteUrl);

                // The live GANSID guest template is an admin override reading
                // "Your ticket is attached; please present the QR code at the
                // entrance" — with NO {{qr_image_url}} anywhere in it. That is
                // the Novartis defect in the main group-guest flow: the body
                // points at a QR that was never rendered. Appending the block
                // makes the promise true no matter how the template is edited.
                const bodyTemplate = ensureTicketBlocks(tpl.body, {
                    includeQr: true,
                    includeDownload: !!downloadUrl,
                    attachmentNote: attachmentNoteFor(!!ticketPdf),
                });

                const vars = {
                    name: attendee.name || 'there',
                    event: eventName,
                    registration_id: attendee.id,
                    qr_image_url: qrImageUrl,
                    ticket_download_url: downloadUrl,
                    purchaser: primary?.name || 'The purchaser',
                    signup_url: publicSiteUrl ? `${publicSiteUrl}/#/` : '',
                };
                const subject = applyPlaceholders(tpl.subject, vars, body.mode);
                const body_html = applyPlaceholders(bodyTemplate, vars, body.mode);
                const html = generateEmailTemplate({
                    title: eventName,
                    content: body_html,
                    fromName: smtpConfig?.fromName,
                    headerImageUrl: tpl.headerImageUrl,
                    footerText: tpl.footerText,
                });
                const embedded = await embedQrForEmail(html, qrData, qrImageUrl, !ticketPdf);
                await sendSimpleEmail({
                    to: attendee.email,
                    subject,
                    html: embedded.html,
                    smtpConfig,
                    attachments: ticketPdf ? [...embedded.attachments, ticketPdf] : embedded.attachments,
                    headerImageUrl: tpl.headerImageUrl,
                });
            } catch (e) {
                console.warn('Failed to send personal ticket on claim-completion', e);
                ticketOk = false;
            }

            // 2. Notify the primary (best-effort)
            if (primary?.email) {
                // Admin-editable notification template. Falls back to a
                // sensible default when the admin hasn't customised it.
                const notifyTpl = resolveEmailTemplate({
                    formOverride: overrideOn ? formEmailOverrides?.templates?.['guest-completion-notify'] : undefined,
                    globalSubject: (appSettings as any)?.email_guest_completion_notify_subject,
                    globalBody: (appSettings as any)?.email_guest_completion_notify_body,
                    defaultSubject: '{{name}} has completed their registration for {{event}}',
                    defaultBody: `<p>Hi {{purchaser}},</p><p><strong>{{name}}</strong> has completed their registration details for <strong>{{event}}</strong>. Their individual ticket confirmation has been emailed to them directly — no action needed from you.</p>`,
                    formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                    globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                    globalFooterText: (appSettings as any)?.email_footer_text,
                });
                const notifyVars = {
                    name: attendee.name || 'Guest',
                    purchaser: primary.name || 'there',
                    event: eventName,
                };
                const subject = applyPlaceholders(notifyTpl.subject, notifyVars);
                const html = generateEmailTemplate({
                    title: eventName,
                    content: applyPlaceholders(notifyTpl.body, notifyVars),
                    fromName: smtpConfig?.fromName,
                    headerImageUrl: notifyTpl.headerImageUrl,
                    footerText: notifyTpl.footerText,
                });
                await sendSimpleEmail({ to: primary.email, subject, html, smtpConfig, headerImageUrl: notifyTpl.headerImageUrl })
                    .catch(e => console.warn('Primary notification failed', e));
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
            // Per-form overrides are only resolvable when we hydrate the form row
            // (pattern 2). Pre-composed callers (pattern 1) don't identify the form,
            // so they get the global/default template chain.
            let formEmailOverrides: any = undefined;

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
                    .select('title, settings')
                    .eq('id', staff.form_id)
                    .maybeSingle();
                formEmailOverrides = (form as any)?.settings?.emailOverrides;

                const origin = sendOrigin(body, req);
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
                if (!completeUrl) completeUrl = buildAppUrl(origin, `/#/form/${staff.form_id}?ref=${staff.id}`);
                if (!signupUrl) signupUrl = buildAppUrl(origin, '/#/');
                if (!eventName) eventName = form?.title || 'the event';
            }

            if (!to) return jsonResponse({ error: 'staff-invite: missing recipient (to/attendeeId)' }, 400);
            if (!completeUrl) return jsonResponse({ error: 'staff-invite: missing completeUrl (and could not derive from attendeeId)' }, 400);
            // completeUrl must be absolute — relative URLs render as dead links in
            // email clients. This catches a missing `body.origin` in the hydrate path
            // before we silently send a broken invitation.
            if (!isAbsoluteHttpUrl(completeUrl)) {
                return jsonResponse({ error: `staff-invite: completeUrl must be absolute (got: ${completeUrl}). Caller must supply body.origin or a fully-qualified completeUrl.` }, 400);
            }

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const overrideOn = formEmailOverrides?.enabled === true;
            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['staff-invite'] : undefined,
                globalSubject: (appSettings as any)?.email_staff_invite_subject,
                globalBody: (appSettings as any)?.email_staff_invite_body,
                defaultSubject: 'Complete your registration for {{event}}',
                defaultBody: `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered you for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong> ({{category}}).</p><p>Please complete your personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account: <a href="{{signup_url}}">{{signup_url}}</a></p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                name: name || 'there',
                purchaser: purchaser || 'A colleague',
                org_name: orgName || '',
                category: category || '',
                complete_url: completeUrl || '',
                signup_url: signupUrl || '',
                event: eventName || 'the event',
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = applyPlaceholders(tpl.body, vars, body.mode);
            const html = generateEmailTemplate({
                title: eventName || 'the event',
                content: body_html,
                // No attachments — suppress the callout.
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            await sendSimpleEmail({ to, subject, html, smtpConfig, headerImageUrl: tpl.headerImageUrl });
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

            // Hydrate the staff row when we have an id. This mode used to take
            // ONLY pre-composed fields, which is why it shipped a "ticket"
            // email containing no ticket: the caller passed `attachments: []`
            // and the template had no QR, so the recipient's only <img> was the
            // (blocked) header logo — the 2026-08-18 Novartis report.
            let staffRow: any = null;
            if (body.attendeeId) {
                const { data } = await supabase
                    .from('attendees').select('*').eq('id', body.attendeeId).maybeSingle();
                staffRow = data;
            }

            let formSettings: any = null;
            if (staffRow?.form_id) {
                const { data: form } = await supabase
                    .from('forms').select('title, settings, fields').eq('id', staffRow.form_id).maybeSingle();
                formSettings = form;
            }
            const formEmailOverrides = (formSettings as any)?.settings?.emailOverrides;
            const overrideOn = formEmailOverrides?.enabled === true;

            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['staff-confirmed'] : undefined,
                globalSubject: (appSettings as any)?.email_staff_confirmed_subject,
                globalBody: (appSettings as any)?.email_staff_confirmed_body,
                defaultSubject: 'Your registration for {{event}} is confirmed',
                defaultBody: `<p>Hi {{name}},</p><p>Thank you for completing your registration for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong>!</p><p>Present the QR code below at the entrance — the team will scan it.</p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            // Three independent routes to a ticket: inline cid: QR, the same
            // PNG attached separately, and a tokenised /#/tickets link that
            // rebuilds the branded PDF. Any one of them is enough to get the
            // holder through the door.
            const qrData = staffRow ? (staffRow.qr_payload || staffRow.id) : '';
            const qrImageUrl = qrData ? buildQrImageUrl(qrData) : '';
            const downloadUrl = staffRow
                ? await buildTicketDownloadUrl(staffRow.id, staffRow.form_id, sendOrigin(body, req))
                : '';

            // Build the ticket BEFORE the copy that describes it — the body
            // states what is attached, and that claim has to be true.
            // Caller-supplied attachments win (a client that already rendered
            // the ticket shouldn't produce a second one).
            let pdfAttachments = (body.attachments || []).map((att: { filename: string; content: string; contentType?: string }) => ({
                filename: att.filename,
                content: att.content,
                encoding: 'base64',
                contentType: att.contentType || 'application/pdf',
            }));
            if (!pdfAttachments.length && staffRow) {
                const built = await buildTicketPdfAttachment(staffRow, formSettings, appSettings);
                if (built) pdfAttachments = [built];
            }

            // Append whatever the (admin-editable) template is missing, so an
            // edit in Settings can never silently delete the ticket again.
            const bodyTemplate = ensureTicketBlocks(tpl.body, {
                includeQr: !!qrImageUrl,
                includeDownload: !!downloadUrl,
                attachmentNote: attachmentNoteFor(pdfAttachments.length > 0),
            });

            const staffDisplayName = staffRow
                ? resolveAttendeeDisplayName(
                    ticketFromAttendeeRow(staffRow, (formSettings as any)?.title),
                    { fields: (formSettings as any)?.fields } as any,
                  )
                : '';
            const vars = {
                // Fresh row FIRST: on the claim path the caller passes the
                // pre-claim placeholder name, which would disagree with the
                // name printed on the attached ticket.
                name: staffDisplayName || body.name || 'there',
                org_name: body.orgName || '',
                event: body.eventName || (formSettings as any)?.title || 'the event',
                registration_id: staffRow?.id || '',
                qr_image_url: qrImageUrl,
                ticket_download_url: downloadUrl,
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = prependReissueNotice(applyPlaceholders(bodyTemplate, vars, body.mode), body.reissue);

            const html = generateEmailTemplate({
                title: vars.event,
                content: body_html,
                attachmentNote: pdfAttachments.length ? 'Your ticket PDF is attached.' : undefined,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            // Drop the loose QR PNG when a full ticket PDF is attached — the
            // PDF is the presentable artefact, the inline QR stays for scanning
            // straight from the message.
            const embedded = qrImageUrl
                ? await embedQrForEmail(html, qrData, qrImageUrl, pdfAttachments.length === 0)
                : { html, attachments: [] as any[] };

            const to = body.to || staffRow?.email;
            if (!to) return jsonResponse({ error: 'staff-claim-completed: missing recipient (to/attendeeId)' }, 400);

            await sendSimpleEmail({
                to,
                subject,
                html: embedded.html,
                smtpConfig,
                attachments: [...embedded.attachments, ...pdfAttachments],
                headerImageUrl: tpl.headerImageUrl,
            });

            // Stamp `last_ticket_email_at` when the caller supplies an
            // attendeeId, so the dashboard reflects "Sent".
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
            return jsonResponse({ ok: true, qrEmbedded: !!qrImageUrl, downloadUrl: !!downloadUrl });
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
                .select('title, settings, fields')
                .eq('id', staff.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the GANSID Congress';
            const formEmailOverrides = (form as any)?.settings?.emailOverrides;
            const orgName = (org?.company_info as any)?.orgName || 'your organization';
            // Prefer the contact person's name (company_info.contactName) over the
            // primary attendee's `name` column — see staff-invite branch above for rationale.
            const purchaser = (org?.company_info as any)?.contactName || org?.name || 'the organization';

            const { data: appSettings } = await supabase
                .from('app_settings').select('*').eq('id', 1).maybeSingle();
            const smtpConfig = appSettings
                ? { host: appSettings.smtp_host, port: Number(appSettings.smtp_port || 587), user: appSettings.smtp_user, pass: appSettings.smtp_pass, fromName: (appSettings as any).email_from_name || 'GANSID Congress' }
                : undefined;

            const origin = sendOrigin(body, req);
            if (!origin) return missingOriginResponse('exhibitor-staff-invite');
            const registrationLink = buildAppUrl(origin, `/#/form/${staff.form_id}?ref=${staff.id}`);
            const signupUrl = buildAppUrl(origin, '/#/');

            const overrideOn = formEmailOverrides?.enabled === true;
            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['staff-invite'] : undefined,
                globalSubject: (appSettings as any)?.email_staff_invite_subject,
                globalBody: (appSettings as any)?.email_staff_invite_body,
                defaultSubject: 'Complete your registration for {{event}}',
                defaultBody: `<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered you for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong> ({{category}}).</p><p>Please complete your personal details:</p><p style="text-align:center;margin:24px 0;"><a href="{{complete_url}}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Complete my registration</a></p><p>You can also create a portal account: <a href="{{signup_url}}">{{signup_url}}</a></p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                name: staff.name || 'there',
                purchaser: purchaser,
                org_name: orgName,
                category: 'Exhibitor staff',
                complete_url: registrationLink,
                signup_url: signupUrl,
                event: eventName,
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = applyPlaceholders(tpl.body, vars, body.mode);
            const html = generateEmailTemplate({
                title: eventName,
                content: body_html,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            await sendSimpleEmail({ to: staff.email, subject, html, smtpConfig, headerImageUrl: tpl.headerImageUrl });
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
                .select('title, settings')
                .eq('id', staff.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the GANSID Congress';
            const formEmailOverrides = (form as any)?.settings?.emailOverrides;
            const overrideOn = formEmailOverrides?.enabled === true;

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

            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['staff-confirmed'] : undefined,
                globalSubject: (appSettings as any)?.email_staff_confirmed_subject,
                globalBody: (appSettings as any)?.email_staff_confirmed_body,
                defaultSubject: 'Your registration for {{event}} is confirmed',
                defaultBody: `<p>Hi {{name}},</p><p>Thank you for completing your registration for <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong>!</p><p>Present the QR code below at the entrance — the team will scan it.</p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                name: staff.name || 'there',
                org_name: orgName,
                event: eventName,
            };

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
                    // Three independent routes to a ticket: inline cid: QR, the
                    // same PNG attached separately, and a tokenised /#/tickets
                    // link. This email previously carried none of them.
                    const qrData = staff.qr_payload || staff.id;
                    const qrImageUrl = buildQrImageUrl(qrData);
                    const downloadUrl = await buildTicketDownloadUrl(staff.id, staff.form_id, sendOrigin(body, req));
                    // Built before the copy that describes it — see staff-claim-completed.
                    const ticketPdf = await buildTicketPdfAttachment(staff, form, appSettings);
                    const bodyTemplate = ensureTicketBlocks(tpl.body, {
                        includeQr: true,
                        includeDownload: !!downloadUrl,
                        attachmentNote: attachmentNoteFor(!!ticketPdf),
                    });
                    const ticketVars = {
                        ...vars,
                        registration_id: staff.id,
                        qr_image_url: qrImageUrl,
                        ticket_download_url: downloadUrl,
                    };
                    const subject = applyPlaceholders(tpl.subject, ticketVars, body.mode);
                    const body_html = prependReissueNotice(applyPlaceholders(bodyTemplate, ticketVars, body.mode), body.reissue);
                    const html = generateEmailTemplate({
                        title: eventName,
                        content: body_html,
                        fromName: smtpConfig?.fromName,
                        headerImageUrl: tpl.headerImageUrl,
                        footerText: tpl.footerText,
                    });
                    const embedded = await embedQrForEmail(html, qrData, qrImageUrl, !ticketPdf);
                    await sendSimpleEmail({
                        to: staff.email,
                        subject,
                        html: embedded.html,
                        smtpConfig,
                        attachments: ticketPdf ? [...embedded.attachments, ticketPdf] : embedded.attachments,
                        headerImageUrl: tpl.headerImageUrl,
                    });
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
                const notifyTpl = resolveEmailTemplate({
                    formOverride: overrideOn ? formEmailOverrides?.templates?.['exhibitor-staff-completion-notify'] : undefined,
                    globalSubject: (appSettings as any)?.email_exhibitor_staff_completion_notify_subject,
                    globalBody: (appSettings as any)?.email_exhibitor_staff_completion_notify_body,
                    defaultSubject: '{{name}} has completed their registration',
                    defaultBody: `<p>Hi {{contact_name}},</p><p><strong>{{name}}</strong> has completed their registration details for the <strong>{{event}}</strong> on behalf of <strong>{{org_name}}</strong>.</p><p>Their individual ticket confirmation has been emailed to them directly.</p>`,
                    formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                    globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                    globalFooterText: (appSettings as any)?.email_footer_text,
                });
                const notifyVars = {
                    name: staff.name || 'Staff member',
                    contact_name: contactName,
                    org_name: orgName || '',
                    event: eventName,
                };
                const subject = applyPlaceholders(notifyTpl.subject, notifyVars);
                const html = generateEmailTemplate({
                    title: eventName,
                    content: applyPlaceholders(notifyTpl.body, notifyVars),
                    fromName: smtpConfig?.fromName,
                    headerImageUrl: notifyTpl.headerImageUrl,
                    footerText: notifyTpl.footerText,
                });
                await sendSimpleEmail({ to: org.email, subject, html, smtpConfig, headerImageUrl: notifyTpl.headerImageUrl })
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
                .from('forms').select('title, settings, fields').eq('id', free.form_id).maybeSingle();
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
            // Optional link — an unresolvable origin drops it (stripDeadLinks
            // removes the empty anchor) rather than blocking the ticket itself.
            const origin = sendOrigin(body, req);
            const signupUrl = buildAppUrl(origin, '/#/');
            const qrData = free.qr_payload || free.id;
            const qrImageUrl = buildQrImageUrl(qrData);

            // Human label for the free guest's pricing category (advertised as {{free_category_name}}).
            // categories live in the pricing_templates TABLE (jsonb), keyed by `name`.
            let freeCategoryName = '';
            try {
                const catId = (free as any).pricing_category_id;
                const tplId = (free as any).pricing_template_id || (form as any)?.settings?.pricingTemplateId;
                if (catId && tplId) {
                    const { data: pt } = await supabase
                        .from('pricing_templates').select('categories').eq('id', tplId).maybeSingle();
                    const cats = Array.isArray((pt as any)?.categories) ? (pt as any).categories : [];
                    freeCategoryName = (cats.find((c: any) => c.id === catId)?.name) || '';
                }
            } catch { freeCategoryName = ''; }

            const formEmailOverrides = (form as any)?.settings?.emailOverrides;
            const overrideOn = formEmailOverrides?.enabled === true;
            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['bogo-ticket'] : undefined,
                globalSubject: (appSettings as any)?.email_bogo_ticket_subject,
                globalBody: (appSettings as any)?.email_bogo_ticket_body,
                defaultSubject: '{{purchaser}} has sent you a free ticket to {{event}}',
                defaultBody: `<p>Hi {{name}},</p>
<p><strong>{{purchaser}}</strong> has gifted you a free ticket to <strong>{{event}}</strong>.</p>
<p>Your check-in QR code is below. Show it at the door.</p>
<div style="text-align:center;margin:24px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="240" height="240" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div>
<p style="color:#666;font-size:13px;">Registration ID: {{registration_id}}</p>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">This ticket is issued to your email address and cannot be transferred to another person. If you have questions or issues, contact <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>
{{account_cta}}`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            // ONE account line, chosen by whether they already have a profile.
            // Telling an existing user to "create a profile" is confusing and
            // was previously unavoidable — the line was hardcoded in the
            // template body, so it went to everyone regardless.
            let hasAccount = false;
            try {
                const { data: prof } = await supabase
                    .from('profiles').select('id').ilike('email', free.email).maybeSingle();
                hasAccount = !!prof;
            } catch { /* unknown → the neutral "sign in or create" copy below */ }
            const accountCta = hasAccount
                ? `<p style="margin-top:16px;font-size:14px;">You already have an account on the GANSID Congress app. <a href="${signupUrl}">Sign in</a> with <strong>${free.email}</strong> to manage your ticket and access event resources.</p>`
                : `<p style="margin-top:16px;font-size:14px;">If you don't have an account on the GANSID Congress app yet, you can <a href="${signupUrl}">create one here</a> using <strong>${free.email}</strong> — your ticket links to it automatically, so you can manage it and access event resources any time.</p>`;

            const vars = {
                name: free.name || 'there',
                purchaser: source?.name || 'A colleague',
                event: eventName,
                qr_image_url: qrImageUrl,
                registration_id: free.id,
                signup_url: signupUrl,
                admin_contact: BOGO_ADMIN_CONTACT,
                free_category_name: freeCategoryName,
                account_cta: accountCta,
            };
            // Guard the QR against an admin template edit. The hardcoded
            // default carries {{qr_image_url}}, but a Settings override would
            // not — which is exactly how the staff and guest templates lost
            // their QR. The BOGO overrides are empty today; this keeps them
            // safe if that changes.
            // Build the PDF FIRST — attachmentNoteFor(true) was hardcoded here
            // while the PDF was built further down and returns null on failure,
            // so the body could promise "your full ticket is attached as a PDF"
            // with nothing attached. Exactly the claim-without-evidence bug
            // this helper exists to prevent.
            const bogoPdf = await buildTicketPdfAttachment(free, form, appSettings);
            const guardedBogoBody = ensureTicketBlocks(tpl.body, {
                includeQr: true,
                attachmentNote: attachmentNoteFor(!!bogoPdf),
            });
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            let body_html = prependReissueNotice(applyPlaceholders(guardedBogoBody, vars, body.mode), body.reissue);

            // Route 3 to a ticket: the tokenised download page rebuilds the full
            // branded PDF. Survives forwarding and image-stripping alike.
            const dlUrl = await buildTicketDownloadUrl(free.id, free.form_id, origin);
            if (dlUrl) {
                body_html += `<p style="margin-top:18px;font-size:14px;">Prefer a PDF? <a href="${dlUrl}">Download your ticket here</a> — the link keeps working through the event.</p>`;
            }

            const html = generateEmailTemplate({
                title: eventName,
                content: body_html,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            try {
                // The BOGO email used to carry NO PDF — the QR image WAS the
                // ticket — so a blocked remote image left the guest with
                // nothing. It now carries the same branded PDF as every other
                // ticket. Build it FIRST: whether the loose QR PNG is also
                // attached depends on whether the PDF succeeded.
                const embedded = await embedQrForEmail(html, qrData, qrImageUrl, !bogoPdf);
                await sendSimpleEmail({
                    to: free.email,
                    subject,
                    html: embedded.html,
                    smtpConfig,
                    attachments: bogoPdf ? [...embedded.attachments, bogoPdf] : embedded.attachments,
                    headerImageUrl: tpl.headerImageUrl,
                });
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
            const origin = sendOrigin(body, req);
            if (!origin) return missingOriginResponse('bogo-claim-link');
            const claimUrl = buildAppUrl(origin, `/#/form/${free.form_id}?ref=${free.id}`);
            const portalTicketsUrl = buildAppUrl(origin, '/#/portal/tickets');

            const formEmailOverrides = (form as any)?.settings?.emailOverrides;
            const overrideOn = formEmailOverrides?.enabled === true;
            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['bogo-claim-link'] : undefined,
                globalSubject: (appSettings as any)?.email_bogo_claim_link_subject,
                globalBody: (appSettings as any)?.email_bogo_claim_link_body,
                defaultSubject: 'Your free guest claim link for {{event}}',
                defaultBody: `<p>Hi {{payer_name}},</p>
<p>Your free guest claim link for <strong>{{event}}</strong> is ready.</p>
<p style="text-align:center;margin:24px 0;"><a href="{{claim_url}}" style="display:inline-block;padding:12px 24px;background:#ba0028;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Forward this claim link</a></p>
<p>Forward the link to the person you'd like to bring — they'll complete the short claim form and receive their ticket.</p>
<p>You can also manage this and your other tickets from your portal: <a href="{{portal_tickets_url}}">{{portal_tickets_url}}</a></p>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">Once your guest claims this ticket, the email they enter is locked to them. Make sure to forward this to the actual person attending. For issues, contact <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                payer_name: source?.name || 'there',
                event: eventName,
                claim_url: claimUrl,
                portal_tickets_url: portalTicketsUrl,
                admin_contact: BOGO_ADMIN_CONTACT,
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = applyPlaceholders(tpl.body, vars, body.mode);
            const html = generateEmailTemplate({
                title: eventName,
                content: body_html,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            try {
                await sendSimpleEmail({ to: payerEmail, subject, html, smtpConfig, headerImageUrl: tpl.headerImageUrl });
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
            const qrImageUrl = buildQrImageUrl(qrData);

            const formEmailOverrides = (form as any)?.settings?.emailOverrides;
            const overrideOn = formEmailOverrides?.enabled === true;
            const tpl = resolveEmailTemplate({
                formOverride: overrideOn ? formEmailOverrides?.templates?.['bogo-ticket-updated'] : undefined,
                globalSubject: (appSettings as any)?.email_bogo_ticket_updated_subject,
                globalBody: (appSettings as any)?.email_bogo_ticket_updated_body,
                defaultSubject: 'Your {{event}} ticket has been updated',
                defaultBody: `<p>Hi {{name}},</p>
<p>Your ticket for <strong>{{event}}</strong> has been updated by <strong>{{purchaser}}</strong>. The latest version is below — please discard any earlier copies.</p>
<div style="text-align:center;margin:24px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="240" height="240" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">This ticket is issued to your email address and cannot be transferred. Questions? <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>`,
                formHeaderImageUrl: overrideOn ? formEmailOverrides?.headerImageUrl : undefined,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                name: free.name || 'there',
                purchaser: source?.name || 'the buyer',
                event: eventName,
                qr_image_url: qrImageUrl,
                admin_contact: BOGO_ADMIN_CONTACT,
            };
            // Same QR guard as bogo-ticket — a Settings override that dropped
            // {{qr_image_url}} would otherwise ship a ticket with no ticket.
            const updatedPdf = await buildTicketPdfAttachment(free, form, appSettings);
            const guardedUpdatedBody = ensureTicketBlocks(tpl.body, {
                includeQr: true,
                attachmentNote: attachmentNoteFor(!!updatedPdf),
            });
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = applyPlaceholders(guardedUpdatedBody, vars, body.mode);
            const html = generateEmailTemplate({
                title: eventName,
                content: body_html,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            try {
                const embedded = await embedQrForEmail(html, qrData, qrImageUrl, !updatedPdf);
                await sendSimpleEmail({
                    to: free.email,
                    subject,
                    html: embedded.html,
                    smtpConfig,
                    attachments: updatedPdf ? [...embedded.attachments, updatedPdf] : embedded.attachments,
                    headerImageUrl: tpl.headerImageUrl,
                });
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

            const tpl = resolveEmailTemplate({
                globalSubject: (appSettings as any)?.email_bogo_ticket_withdrawn_subject,
                globalBody: (appSettings as any)?.email_bogo_ticket_withdrawn_body,
                defaultSubject: 'Your free ticket to {{event}} has been withdrawn',
                defaultBody: `<p>Hi {{name}},</p>
<p>The free ticket <strong>{{purchaser}}</strong> sent you for <strong>{{event}}</strong> has been withdrawn. We're sorry for the inconvenience.</p>
<p style="margin-top:20px;padding:12px;background:#f9fafb;border-left:3px solid #e5e7eb;font-size:14px;">For questions or alternatives, please contact <a href="mailto:{{admin_contact}}">{{admin_contact}}</a>.</p>`,
                globalHeaderImageUrl: (appSettings as any)?.email_header_logo,
                globalFooterText: (appSettings as any)?.email_footer_text,
            });

            const vars = {
                name: guestName,
                purchaser: payerName,
                event: eventName,
                admin_contact: BOGO_ADMIN_CONTACT,
            };
            const subject = applyPlaceholders(tpl.subject, vars, body.mode);
            const body_html = applyPlaceholders(tpl.body, vars, body.mode);
            const html = generateEmailTemplate({
                title: eventName,
                content: body_html,
                fromName: smtpConfig?.fromName,
                headerImageUrl: tpl.headerImageUrl,
                footerText: tpl.footerText,
            });

            try {
                await sendSimpleEmail({ to: guestEmail, subject, html, smtpConfig, headerImageUrl: tpl.headerImageUrl });
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
        // Branding for the shared shell (global only on this path; per-form header
        // override applies to the P4 registration-confirmed path, not the PDF path).
        let ticketHeaderImage: string | undefined;
        let ticketFooterText: string | undefined;
        try {
            const sbUrl = Deno.env.get('SUPABASE_URL')!;
            const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const sb = createClient(sbUrl, sbKey);
            const { data: appS } = await sb.from('app_settings').select('email_header_logo, email_footer_text').eq('id', 1).maybeSingle();
            // This path hands the RAW URL to the adapter (no resolveEmailTemplate),
            // so replicate the resolver's http(s)-only filter here — data:/blob:
            // URIs get stripped by Gmail/Outlook and would arrive broken.
            const raw = (appS as any)?.email_header_logo;
            ticketHeaderImage = (typeof raw === 'string' && /^https?:\/\//i.test(raw.trim())) ? raw.trim() : undefined;
            ticketFooterText = (appS as any)?.email_footer_text || undefined;
        } catch { /* branding is best-effort; fall back to wordmark */ }
        const html = generateEmailTemplate({
            title: bannerTitle,
            content: messageHtml,
            attachmentNote: hasAttachments ? 'Attachment included — please review the PDF.' : undefined,
            fromName,
            headerImageUrl: ticketHeaderImage,
            footerText: ticketFooterText,
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

        // Persist the failure. Edge logs age out unread and are unreachable
        // entirely on GANSID (its project sits in an org the MCP token cannot
        // see), so a send that fails silently used to leave NOTHING to
        // investigate — an admin reported "reminders stopped working" and the
        // only way to find the 550 quota rejection was to reproduce it by hand
        // against production. Best-effort and never rethrows: a logging problem
        // must not change what the caller is told.
        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL');
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
            if (supabaseUrl && serviceKey) {
                const admin = createClient(supabaseUrl, serviceKey);
                await admin.from('email_failures').insert(
                    buildEmailFailureRow({ ...failureCtx, rawError: message }),
                );
            }
        } catch (logErr) {
            console.error('send-ticket-email: failed to record email_failures row', String(logErr));
        }

        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
