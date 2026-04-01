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
}) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #0070f3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 40px; border-radius: 0 0 8px 8px; border: 1px solid #eee; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #888; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${data.title}</h1>
      </div>
      <div class="content">
        <p style="font-size: 18px; font-weight: bold;">${data.greeting},</p>
        ${data.content}
        <div class="footer">
          <p>This email was sent by the SCAGO Event Management System.</p>
        </div>
      </div>
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

        const html = generateEmailTemplate({
            title: 'Event Registration',
            greeting: `Hello ${email.name}`,
            content: `<p>${email.message}</p>`,
        });

        // Nodemailer accepts base64 natively
        const attachments = (email.attachments || []).map((att: { filename: string; content: string; contentType?: string }) => ({
            filename: att.filename,
            content: att.content,
            encoding: 'base64',
            contentType: att.contentType || 'application/pdf',
        }));

        await transporter.sendMail({
            from: `"SCAGO Portal" <${smtpConfig.user}>`,
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
