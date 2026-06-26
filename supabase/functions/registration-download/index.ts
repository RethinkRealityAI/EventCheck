import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyRegistrationToken } from '../_shared/registrationToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── SAFE_SETTINGS_KEYS allow-list ───────────────────────────────────────────
// This is a SECURITY-CRITICAL allow-list. Only snake_case column names from
// app_settings that the public ticket-download page legitimately needs are
// listed here. When in doubt, OMIT rather than include.
//
// Confirmed by reading services/storageService.ts (getSettings mapper) and
// utils/pdfGenerator.ts (generateTicketPDF field usage):
//
//   pdf_settings      — single JSONB column containing ALL of:
//                         logoUrl, primaryColor, organizationName,
//                         organizationInfo, footerText, backgroundImage,
//                         eventTitle, enabled
//                       pdfGenerator reads `settings.pdfSettings` which maps
//                       directly from this column. It is the ONLY PDF/branding
//                       column — the plan's `pdf_logo_url`, `pdf_primary_color`,
//                       etc. do NOT exist as separate columns.
//   currency          — used for display on the ticket (payment amount label)
//   email_from_name   — used in the download page's "sent by" display (non-secret)
//
// ABSOLUTELY EXCLUDED (never add these back):
//   smtp_host, smtp_port, smtp_user, smtp_pass  — SMTP credentials
//   paypal_client_id, paypal_client_secret       — PayPal keys
//   paypal_sandbox_client_id, etc.               — PayPal sandbox keys
//   email_*_subject, email_*_body, etc.          — email templates (not needed for PDF)
//   sponsor_*, dashboard_*, feature_*            — admin/internal config
// ─────────────────────────────────────────────────────────────────────────────
const SAFE_SETTINGS_KEYS: string[] = [
  'id',
  'pdf_settings',    // JSONB: logoUrl, primaryColor, organizationName, footerText, backgroundImage, eventTitle, enabled
  'currency',        // e.g. 'CAD' — used in ticket amount display
  'email_from_name', // non-secret display name; needed for page branding fallback
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let token = '';
    if (req.method === 'GET') {
      token = new URL(req.url).searchParams.get('token') ?? '';
    } else {
      const reqBody = await req.json().catch(() => ({}));
      token = reqBody.token ?? '';
    }

    if (!token) return json({ error: 'invalid-token', reason: 'malformed' }, 400);

    // SUPABASE_SERVICE_ROLE_KEY is used both as the HMAC secret (matching
    // verify-payment which signs with the same key) and as the service-role
    // credential for the Supabase client below.
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const result = await verifyRegistrationToken(token, secret, Date.now());
    if (!result.valid) return json({ error: 'invalid-token', reason: result.reason }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Fetch primary attendee
    const { data: primary, error: pErr } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', result.primaryAttendeeId)
      .maybeSingle();
    if (pErr || !primary) return json({ error: 'not-found' }, 404);

    // Fetch linked guests (ordered for stable PDF output)
    const { data: guests } = await supabase
      .from('attendees')
      .select('*')
      .eq('primary_attendee_id', result.primaryAttendeeId)
      .order('registered_at', { ascending: true });

    // Fetch the form (for PDF overrides + form title)
    const { data: form } = await supabase
      .from('forms')
      .select('*')
      .eq('id', result.formId)
      .maybeSingle();

    // Fetch app_settings and strip to the safe allow-list only.
    // This is the critical security gate: we SELECT * and then filter,
    // so a new column added to app_settings is never accidentally leaked.
    const { data: rawSettings } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    const settings: Record<string, unknown> = {};
    if (rawSettings) {
      for (const k of SAFE_SETTINGS_KEYS) {
        if (k in (rawSettings as Record<string, unknown>)) {
          settings[k] = (rawSettings as Record<string, unknown>)[k];
        }
      }
    }

    return json({ primary, guests: guests ?? [], form, settings });
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
