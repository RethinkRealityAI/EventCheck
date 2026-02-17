// Follow this to deploy: https://supabase.com/docs/guides/functions
// supabase functions deploy send-ticket-email

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

        if (!smtpConfig?.user || !smtpConfig?.pass) {
            return new Response(
                JSON.stringify({ error: 'SMTP credentials are not configured.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const client = new SMTPClient({
            connection: {
                hostname: smtpConfig.host || 'smtp.ionos.com',
                port: smtpConfig.port || 587,
                tls: false,
                auth: {
                    username: smtpConfig.user,
                    password: smtpConfig.pass,
                },
            },
        });

        const html = generateEmailTemplate({
            title: 'Event Registration',
            greeting: `Hello ${email.name}`,
            content: `<p>${email.message}</p>`,
        });

        // Convert base64 attachments to Uint8Array for denomailer
        const attachments = (email.attachments || []).map((att: { filename: string; content: string; contentType?: string }) => ({
            filename: att.filename,
            content: Uint8Array.from(atob(att.content), (c) => c.charCodeAt(0)),
            contentType: att.contentType || 'application/pdf',
        }));

        await client.send({
            from: `SCAGO Portal <${smtpConfig.user}>`,
            to: email.to,
            subject: email.subject,
            html: html,
            attachments: attachments,
        });

        await client.close();

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
