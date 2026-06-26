// supabase/functions/contact-invite-claim/index.ts
//
// Public, token-gated. Two actions:
//   resolve   → returns the invited contact's name/email + formId + whether
//               they've already registered (NO secrets ever leave).
//   register  → idempotently creates a FREE attendee row and links the
//               imported_contacts row to it, then best-effort fires the P4
//               registration-confirmed email with a freshly-signed download
//               token.
//
// The HMAC invite token IS the credential — verify_jwt=false on the gateway,
// and the function trusts NOTHING from the client for the free grant beyond
// what the verified token encodes (contactId, formId).
//
// ⚠️ CRITICAL: the free attendee insert MUST use payment_method = null. The
// attendees_payment_method_check constraint allows ONLY
// {card,paypal,cheque,external,promo,bogo} (+ NULL). A label like 'comp' /
// 'invite' would 500 EXACTLY like the 2026-06-12 BOGO incident. payment_status
// ='free' + the imported_contacts.attendee_id link already distinguish these
// rows. Do NOT change this without altering the CHECK on BOTH tenants first.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyInviteToken, signRegistrationToken } from '../_shared/registrationToken.ts';

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

const DOWNLOAD_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days (mirrors verify-payment's confirmation link)

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json();
    const { action, token } = body;

    const v = await verifyInviteToken(token ?? '', serviceKey, Date.now());
    if (!v.valid) return json({ error: 'invalid-token', reason: v.reason }, 400);

    const svc = createClient(url, serviceKey);
    const { data: contact } = await svc.from('imported_contacts').select('*').eq('id', v.contactId).maybeSingle();
    if (!contact) return json({ error: 'contact-not-found' }, 404);

    if (action === 'resolve') {
      // No secrets — just the prefill data + already-registered flag.
      return json({
        contactName: (contact as any).name ?? '',
        contactEmail: (contact as any).email ?? '',
        formId: v.formId,
        alreadyRegistered: !!(contact as any).attendee_id,
      });
    }

    if (action === 'register') {
      // Idempotent: a second submit after success returns 409 (not a duplicate row).
      if ((contact as any).attendee_id) {
        return json({ error: 'already-registered', attendeeId: (contact as any).attendee_id }, 409);
      }
      const name = (body.name ?? (contact as any).name ?? '').toString();
      const email = (body.email ?? (contact as any).email ?? '').toString();
      const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
      if (!email) return json({ error: 'email-required' }, 400);

      const id = crypto.randomUUID();
      const row = {
        id,
        form_id: v.formId,
        name,
        email,
        answers,
        ticket_type: 'Invited (free)',
        payment_status: 'free',
        payment_method: null,           // ⚠️ MUST be null — see CRITICAL note (CHECK constraint)
        payment_amount: '0.00',
        qr_payload: JSON.stringify({ id }),
        registered_at: new Date().toISOString(),
        is_primary: true,
        // user_id intentionally unset — the link_attendee_to_existing_user
        // BEFORE-INSERT trigger auto-links it if the email has an auth account.
      };
      const { error: insErr } = await svc.from('attendees').insert(row);
      if (insErr) return json({ error: 'insert-failed', detail: insErr.message }, 500);

      // Atomic claim: link the contact → this attendee ONLY if it's still
      // unclaimed. The attendees FK requires the row to exist first, so we
      // insert-then-claim. If a concurrent register already linked the contact
      // (the early fast-path missed it by a few ms), the conditional UPDATE
      // matches 0 rows — we lost the race, so delete our just-inserted orphan
      // attendee and return the existing link as 409. Only the winner proceeds
      // to send the confirmation email below.
      const { data: claimed } = await svc.from('imported_contacts')
        .update({ attendee_id: id, registered_at: new Date().toISOString() })
        .eq('id', v.contactId).is('attendee_id', null).select('id');
      if (!claimed || claimed.length === 0) {
        // Lost the race — another concurrent register already linked this contact. Delete our orphan.
        await svc.from('attendees').delete().eq('id', id);
        const { data: existing } = await svc.from('imported_contacts').select('attendee_id').eq('id', v.contactId).maybeSingle();
        return json({ error: 'already-registered', attendeeId: (existing as any)?.attendee_id ?? null }, 409);
      }

      // Reuse the P4 registration-confirmed email (download link). Best-effort —
      // never fail the registration on an email hiccup.
      try {
        const origin = (body.origin ?? req.headers.get('origin') ?? Deno.env.get('PUBLIC_SITE_URL') ?? '').toString();
        const dlToken = await signRegistrationToken(id, v.formId, serviceKey, Date.now(), DOWNLOAD_TTL_MS);
        const downloadUrl = `${origin}/#/tickets?token=${encodeURIComponent(dlToken)}`;
        await fetch(`${url}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ mode: 'registration-confirmed', primaryAttendeeId: id, downloadUrl }),
        });
      } catch (e) { console.error('contact-invite-claim: confirmation email failed', String(e)); }

      return json({ ok: true, attendeeId: id });
    }

    return json({ error: 'unknown-action' }, 400);
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
