// @ts-nocheck
// Follow this to deploy: https://supabase.com/docs/guides/functions
// supabase functions deploy send-ticket-email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

function jsonResponse(body: Record<string, any>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

/**
 * Generate a branded HTML email template.
 */
function generateEmailTemplate(data: {
    title: string;
    greeting: string;
    content: string;
    attachmentNote?: string; // if provided, render as the callout; if undefined, suppress the callout
}) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #1a73e8, #0052cc); padding: 40px 40px 30px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">${data.title}</h1>
                  <div style="width: 50px; height: 3px; background: rgba(255,255,255,0.5); margin: 16px auto 0; border-radius: 2px;"></div>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="background-color: #ffffff; padding: 40px;">
                  <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a2e;">${data.greeting},</p>
                  <div style="font-size: 15px; line-height: 1.7; color: #444;">
                    ${data.content}
                  </div>
                  ${data.attachmentNote ? `
                  <!-- Attachment hint -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 28px; background-color: #f0f7ff; border-radius: 8px; border: 1px solid #d4e5f7;">
                    <tr>
                      <td style="padding: 16px 20px;">
                        <p style="margin: 0; font-size: 14px; color: #1a73e8; font-weight: 600;">&#128206; ${data.attachmentNote}</p>
                      </td>
                    </tr>
                  </table>
                  ` : ''}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8f9fb; padding: 24px 40px; text-align: center; border-top: 1px solid #eaedf0;">
                  <p style="margin: 0; font-size: 12px; color: #8c95a1;">This email was sent by SCAGO Event Management.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
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

        // ── GROUP INVITE: send registration-completion link to a pending-claim guest ──
        if (body.mode === 'group-invite') {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            const { data: guest, error: gErr } = await supabase
                .from('attendees')
                .select('*')
                .eq('id', body.attendeeId)
                .maybeSingle();
            if (gErr || !guest) return jsonResponse({ error: 'Guest not found' }, 404);

            const { data: primary } = await supabase
                .from('attendees')
                .select('name, email')
                .eq('id', guest.primary_attendee_id)
                .maybeSingle();

            const { data: form } = await supabase
                .from('forms')
                .select('title')
                .eq('id', guest.form_id)
                .maybeSingle();
            const eventName = form?.title || 'the event';

            const origin = body.origin || '';
            const registrationLink = `${origin}/#/form/${guest.form_id}?ref=${guest.id}`;

            const subject = `Complete your registration for ${eventName}`;
            const html = `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2>Hi ${guest.name || 'there'},</h2>
                  <p><strong>${primary?.name || 'A colleague'}</strong> has registered you for <strong>${eventName}</strong>.</p>
                  <p>Your registration is paid. Please click below to complete your personal details (dietary restrictions, emergency contact, consent).</p>
                  <p style="text-align:center;margin:24px 0;">
                    <a href="${registrationLink}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:white;border-radius:6px;text-decoration:none;font-weight:600;">
                      Complete my registration
                    </a>
                  </p>
                  <p style="color:#666;font-size:13px;">Or copy this link into your browser:<br>${registrationLink}</p>
                </div>
            `;

            await sendSimpleEmail({ to: guest.email, subject, html });
            return jsonResponse({ ok: true });
        }

        // ── GUEST CLAIM COMPLETED: send ticket to the now-claimed guest + notify primary ──
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

            // 1. Send a personal ticket confirmation to the claimed guest
            let ticketOk = true;
            try {
                const subject = `Your registration for ${eventName} is confirmed`;
                const html = `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                      <h2>Hi ${attendee.name || 'there'},</h2>
                      <p>Thank you for completing your registration for <strong>${eventName}</strong>!</p>
                      <p>You are all set. Please bring this confirmation (or the QR code on your ticket) to the event for check-in.</p>
                      <p style="color:#666;font-size:13px;">Registration ID: ${attendee.id}</p>
                    </div>
                `;
                await sendSimpleEmail({ to: attendee.email, subject, html });
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
                    const subject = `${attendee.name} has completed their registration`;
                    const html = `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                          <p>Hi ${primary.name || 'there'},</p>
                          <p><strong>${attendee.name}</strong> has completed their registration details for <strong>${eventName}</strong>.
                          Their individual ticket confirmation has been emailed to them directly.</p>
                        </div>
                    `;
                    await sendSimpleEmail({ to: primary.email, subject, html })
                        .catch(e => console.warn('Primary notification failed', e));
                }
            }

            return jsonResponse({ ok: ticketOk });
        }

        // ── EXHIBITOR STAFF INVITE: send registration-completion link to an exhibitor staff member ──
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

            const origin = body.origin || '';
            const registrationLink = `${origin}/#/form/${staff.form_id}?ref=${staff.id}`;

            const subject = `Complete your registration for ${eventName}`;
            const html = `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                  <h2>Hi ${staff.name || 'there'},</h2>
                  <p><strong>${orgName}</strong> has registered you for the <strong>${eventName}</strong> as an exhibitor staff member.</p>
                  <p>Please click below to complete your personal details (dietary restrictions, accessibility needs, consent).</p>
                  <p style="text-align:center;margin:24px 0;">
                    <a href="${registrationLink}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:white;border-radius:6px;text-decoration:none;font-weight:600;">
                      Complete my registration
                    </a>
                  </p>
                  <p style="color:#666;font-size:13px;">Or copy this link into your browser:<br>${registrationLink}</p>
                </div>
            `;

            await sendSimpleEmail({ to: staff.email, subject, html });
            return jsonResponse({ ok: true });
        }

        // ── EXHIBITOR STAFF CLAIM COMPLETED: send ticket to claimed staff + notify org contact ──
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

            // 1. Send personal ticket confirmation to the staff member
            try {
                const subject = `Your registration for ${eventName} is confirmed`;
                const html = `
                    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                      <h2>Hi ${staff.name || 'there'},</h2>
                      <p>Thank you for completing your registration for <strong>${eventName}</strong>!</p>
                      <p>You are all set. Please bring this confirmation (or the QR code on your ticket) to the event for check-in.</p>
                      <p style="color:#666;font-size:13px;">Registration ID: ${staff.id}</p>
                    </div>
                `;
                await sendSimpleEmail({ to: staff.email, subject, html });
            } catch (e) {
                console.warn('Failed to send exhibitor-staff ticket email', e);
            }

            // 2. Notify the org contact (best-effort)
            if (staff.primary_attendee_id) {
                const { data: org } = await supabase
                    .from('attendees')
                    .select('company_info, email')
                    .eq('id', staff.primary_attendee_id)
                    .maybeSingle();
                const contactEmail = org?.email;
                const orgName = (org?.company_info as any)?.orgName || 'your organization';
                if (contactEmail) {
                    const subject = `${staff.name} has completed their registration`;
                    const html = `
                        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                          <p>Hi ${(org?.company_info as any)?.contactName || 'there'},</p>
                          <p><strong>${staff.name}</strong> has completed their registration details for the <strong>${eventName}</strong> on behalf of <strong>${orgName}</strong>.</p>
                          <p>Their individual ticket confirmation has been emailed to them directly.</p>
                        </div>
                    `;
                    await sendSimpleEmail({ to: contactEmail, subject, html })
                        .catch(e => console.warn('Org contact notification failed', e));
                }
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
        const html = generateEmailTemplate({
            title: 'Event Registration',
            greeting: `Hello ${email.name}`,
            content: `<p>${email.message}</p>`,
            attachmentNote: hasAttachments ? 'Attachment included — please review the PDF.' : undefined,
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
