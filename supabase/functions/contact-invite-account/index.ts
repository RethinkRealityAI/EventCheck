// supabase/functions/contact-invite-account/index.ts
//
// Public, token-gated. Creates a PRE-VERIFIED portal account (email_confirm=true,
// no Supabase confirmation email) for an imported contact who is completing the
// free invite-to-register flow.
//
// Why this exists: the contact clicked a unique, HMAC-signed invite link that
// was emailed to their own inbox — that already proves they control the address.
// Forcing them through Supabase's standard email-verification step (which the
// browser-side supabase.auth.signUp() triggers when "Confirm email" is on) is
// redundant friction. This function mints the account already-confirmed using
// the service-role admin API, so the client can immediately sign them in.
//
// Security model (mirrors contact-invite-claim):
//   * verify_jwt=false on the gateway — the invited person isn't logged in.
//   * The HMAC invite token IS the credential. We verify it server-side and
//     create the account for the email stored on the contact row — NEVER an
//     email supplied by the client. So a valid token only ever creates an
//     account for the address that token was issued to.
//   * Only creates an 'attendee' account (the handle_new_user trigger sets the
//     role; we never grant elevated roles here).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyInviteToken } from '../_shared/registrationToken.ts';

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { token, password, fullName } = await req.json();
    if (!password || String(password).length < 8) {
      return json({ error: 'weak-password' }, 400);
    }

    // The invite token is the credential — it encodes the contact id + form id.
    const v = await verifyInviteToken(token ?? '', serviceKey, Date.now());
    if (!v.valid) return json({ error: 'invalid-token', reason: v.reason }, 400);

    const svc = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Email comes from the SERVER-side contact row, never the client.
    const { data: contact } = await svc
      .from('imported_contacts').select('email, name').eq('id', v.contactId).maybeSingle();
    const email = (contact as any)?.email ? String((contact as any).email).trim().toLowerCase() : '';
    if (!email) return json({ error: 'contact-not-found' }, 404);

    // Create the account already email-confirmed — no Supabase verification
    // email is sent. The handle_new_user trigger inserts a profile with the
    // default 'attendee' role; the link_attendees_to_new_user trigger backlinks
    // any matching attendee rows by email.
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: (fullName ?? (contact as any)?.name ?? '').toString(), role: 'attendee' },
    });

    if (createErr || !created?.user) {
      const msg = (createErr?.message || '').toLowerCase();
      // Already-registered email: surface a distinct code so the client can tell
      // the user to sign in instead of implying a new account was made. This is
      // not an enumeration leak beyond what the token already implies — the
      // caller already proved ownership of THIS email via the invite link.
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        return json({ error: 'already-exists', email }, 409);
      }
      return json({ error: 'create-failed', detail: createErr?.message || 'unknown' }, 500);
    }

    // The client now calls signInWithPassword({ email, password }) to establish
    // the session — the account is confirmed, so it succeeds immediately.
    return json({ ok: true, email });
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
