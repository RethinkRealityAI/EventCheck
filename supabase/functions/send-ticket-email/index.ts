// @ts-nocheck
// Follow this to deploy: https://supabase.com/docs/guides/functions
// supabase functions deploy send-ticket-email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

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

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { smtpConfig, email } = await req.json();

        const smtpHost = Deno.env.get('SMTP_HOST') || smtpConfig?.host || 'smtp.ionos.com';
        const smtpPort = Number(Deno.env.get('SMTP_PORT') || smtpConfig?.port || 587);
        const smtpUser = Deno.env.get('SMTP_USER') || smtpConfig?.user;
        const smtpPass = Deno.env.get('SMTP_PASS') || smtpConfig?.pass;

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
            from: `"SCAGO" <${smtpConfig.user}>`,
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
