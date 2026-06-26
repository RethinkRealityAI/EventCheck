// supabase/functions/contact-invite-send/index.ts
//
// Admin-only. Mints a signed FREE-registration invite token for an imported
// contact and emails the link via send-ticket-email's pre-rendered
// `contact-register-invite` mode.
//
// Gateway is verify_jwt=true so the caller is authenticated; the function
// ADDITIONALLY asserts the caller is an admin/super_admin before signing
// anything (mirrors the admin-invite admin-assertion pattern: createClient
// with the caller's Authorization header → auth.getUser() → query
// profiles.role with the service-role client).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signInviteToken } from '../_shared/registrationToken.ts';

// supabase-js v2.45+ injects x-supabase-client-platform + x-supabase-api-version
// on every functions.invoke(); both MUST be in the allow-list or the browser
// blocks the preflight (§18 CORS gotcha).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Admin gate: the caller's JWT must belong to an admin/super_admin. ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser();
    if (uErr || !user) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(url, serviceKey);
    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes((profile as any).role)) {
      return json({ error: 'forbidden' }, 403);
    }

    const { contactId, formId, origin, subject, html } = await req.json();
    if (!contactId || !formId || !origin || !subject || !html) return json({ error: 'missing-fields' }, 400);

    const { data: contact } = await svc.from('imported_contacts').select('id, email').eq('id', contactId).maybeSingle();
    if (!contact || !(contact as any).email) return json({ error: 'contact-not-found' }, 404);

    // Mint the invite link and inject it as {{registration_link}}.
    const token = await signInviteToken(contactId, formId, serviceKey, Date.now(), TTL_MS);
    const link = `${origin}/#/form/${formId}?invite=${encodeURIComponent(token)}`;
    const renderedHtml = String(html).replace(/\{\{registration_link\}\}/g, link);
    const renderedSubject = String(subject);

    // Send via send-ticket-email's pre-rendered mode.
    const resp = await fetch(`${url}/functions/v1/send-ticket-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ mode: 'contact-register-invite', to: (contact as any).email, subject: renderedSubject, html: renderedHtml }),
    });
    if (!resp.ok) {
      await svc.from('imported_contacts').update({ email_status: 'failed', email_error: `send ${resp.status}` }).eq('id', contactId);
      return json({ error: 'send-failed', status: resp.status }, 502);
    }
    await svc.from('imported_contacts').update({ email_status: 'sent', email_sent_at: new Date().toISOString(), email_subject: renderedSubject }).eq('id', contactId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
