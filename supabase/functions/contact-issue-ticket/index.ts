// supabase/functions/contact-issue-ticket/index.ts
//
// Admin-only. Issues a FREE ticket to an imported contact WITHOUT them filling
// the registration form: creates an 'Issued (free)' attendee, links the contact,
// and sends the P4 `registration-confirmed` email (secure /#/tickets download
// link). The contact then appears in the registration dashboard + shows
// "Registered" in Contacts, exactly like a completed invite — but no form,
// no consents (admin-issued comp).
//
// Gateway verify_jwt=true; the function ADDITIONALLY asserts admin/super_admin
// (mirrors contact-invite-send). Idempotent: an already-registered contact is
// RESENT their existing ticket instead of getting a duplicate.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signRegistrationToken } from '../_shared/registrationToken.ts';
import { buildIssuedAttendeeRow } from '../_shared/issuedTicket.ts';
import { pickAttendeeForContact } from '../_shared/attendeeIdentity.ts';
import { wrapClickUrl } from '../_shared/emailTracking.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DOWNLOAD_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days — must outlast the event

// Native Deno.serve (no std/http import) — the edge runtime provides it, and it
// avoids a flaky deno.land bundle-time fetch that intermittently times out.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Admin gate ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser();
    if (uErr || !user) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(url, serviceKey);
    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes((profile as any).role)) {
      return json({ error: 'forbidden' }, 403);
    }

    const { contactId, formId, origin, trackingId: rawTrackingId } = await req.json();
    if (!contactId || !formId) return json({ error: 'missing-fields' }, 400);

    const { data: contact } = await svc
      .from('imported_contacts').select('id, email, name, attendee_id').eq('id', contactId).maybeSingle();
    if (!contact) return json({ error: 'contact-not-found' }, 404);
    const email = String((contact as any).email ?? '').trim();
    const name = String((contact as any).name ?? '').trim();
    if (!email) return json({ error: 'no-email' }, 400);

    // Best-effort P4 confirmation email for a given attendee (token minted IN-runtime
    // → the /#/tickets link is valid because registration-download uses the same secret).
    // Tracking id for this send. Issued tickets were previously invisible in
    // the Contacts tab — no email_sends row, no open/click data — so an admin
    // could not tell whether a ticket email had gone out at all.
    const trackingId = typeof rawTrackingId === 'string' && rawTrackingId.trim()
      ? rawTrackingId.trim()
      : crypto.randomUUID().replace(/-/g, '').slice(0, 24);

    const sendTicket = async (attendeeId: string): Promise<boolean> => {
      let ok = false;
      let subject = 'Your ticket';
      try {
        const base = String(origin || Deno.env.get('PUBLIC_SITE_URL') || '');
        const token = await signRegistrationToken(attendeeId, formId, serviceKey, Date.now(), DOWNLOAD_TTL_MS);
        // The download link is the one actionable URL in this email — wrap it
        // so clicks register, exactly like a campaign CTA.
        const rawDownloadUrl = `${base}/#/tickets?token=${encodeURIComponent(token)}`;
        const downloadUrl = wrapClickUrl(url, trackingId, rawDownloadUrl);
        const resp = await fetch(`${url}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            mode: 'registration-confirmed',
            primaryAttendeeId: attendeeId,
            downloadUrl,
            // send-ticket-email appends the 1×1 open pixel to the rendered shell.
            trackingId,
          }),
        });
        ok = resp.ok;
        if (!resp.ok) console.error('contact-issue-ticket: email non-2xx', resp.status, await resp.text());
        else {
          try { subject = (await resp.clone().json())?.subject || subject; } catch { /* not JSON */ }
        }
      } catch (e) {
        console.error('contact-issue-ticket: email threw', String(e));
        ok = false;
      }
      // Log to email_sends so the Contacts tab can show WHAT was sent and
      // surface opens/clicks. recipient_attendee_id keys it to this specific
      // attendee — `email` is not an identity (CLAUDE.md §18). Best-effort:
      // analytics must never fail the issue.
      if (ok) {
        try {
          await svc.from('email_sends').insert({
            tracking_id: trackingId,
            recipient_email: email,
            recipient_attendee_id: attendeeId,
            subject,
            template_key: 'contact-issued-ticket',
            form_id: formId,
            metadata: { source: 'contact-issue-ticket', contactId },
          });
        } catch (e) { console.error('contact-issue-ticket: email_sends log failed', String(e)); }
      }
      return ok;
    };

    // 1. Contact already linked to an attendee → RESEND that ticket (no dupe).
    if ((contact as any).attendee_id) {
      const emailSent = await sendTicket((contact as any).attendee_id);
      return json({ ok: true, attendeeId: (contact as any).attendee_id, resent: true, emailSent });
    }

    // 2. An attendee already exists for this email+form (registered elsewhere) →
    //    link this contact to it + resend. `email` is NOT an identity key —
    //    partners/colleagues share one inbox — so only reuse a row that
    //    plausibly belongs to THIS contact (name match, and not already claimed
    //    by another contact). Otherwise fall through and mint their own row,
    //    keyed by its own attendee id. See _shared/attendeeIdentity.ts.
    const { data: sameEmail } = await svc.from('attendees')
      .select('id, name, email').eq('form_id', formId).ilike('email', email).neq('is_test', true);
    const candidates = (sameEmail ?? []) as Array<{ id: string; name: string | null }>;
    let claimedByOtherContact: string[] = [];
    if (candidates.length > 0) {
      const { data: otherLinks } = await svc.from('imported_contacts')
        .select('attendee_id')
        .in('attendee_id', candidates.map(c => c.id))
        .neq('id', contactId);
      claimedByOtherContact = (otherLinks ?? [])
        .map((r: any) => r.attendee_id)
        .filter((id: unknown): id is string => typeof id === 'string');
    }
    const decision = pickAttendeeForContact({ contactName: name, candidates, claimedByOtherContact });
    if (decision.action === 'reuse') {
      const existingId = decision.attendeeId;
      await svc.from('imported_contacts')
        .update({ attendee_id: existingId, registered_at: new Date().toISOString() })
        .eq('id', contactId).is('attendee_id', null);
      const emailSent = await sendTicket(existingId);
      return json({ ok: true, attendeeId: existingId, resent: true, emailSent });
    }

    // 3. Create a fresh free 'Issued (free)' attendee.
    const id = crypto.randomUUID();
    const row = { ...buildIssuedAttendeeRow(id, formId, name, email), registered_at: new Date().toISOString() };
    const { data: ins, error: insErr } = await svc.from('attendees').insert(row).select('id');
    if (insErr) return json({ error: 'insert-failed', detail: insErr.message }, 500);
    if (!ins || ins.length === 0) return json({ error: 'insert-failed', detail: '0 rows' }, 500);

    // Atomic claim (insert-then-claim; delete the orphan if we lost a race).
    const { data: claimed } = await svc.from('imported_contacts')
      .update({ attendee_id: id, registered_at: new Date().toISOString() })
      .eq('id', contactId).is('attendee_id', null).select('id');
    if (!claimed || claimed.length === 0) {
      await svc.from('attendees').delete().eq('id', id);
      const { data: c2 } = await svc.from('imported_contacts').select('attendee_id').eq('id', contactId).maybeSingle();
      const existingId = (c2 as any)?.attendee_id as string | null;
      if (existingId) {
        const emailSent = await sendTicket(existingId);
        return json({ ok: true, attendeeId: existingId, resent: true, emailSent });
      }
      return json({ error: 'link-failed' }, 500);
    }

    const emailSent = await sendTicket(id);
    return json({ ok: true, attendeeId: id, resent: false, emailSent });
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
