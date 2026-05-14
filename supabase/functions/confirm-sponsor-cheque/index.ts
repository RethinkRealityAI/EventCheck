// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { attendeeId } = await req.json();
    if (!attendeeId) return jsonResponse({ error: 'attendeeId required' }, 400);

    // ── Admin auth: require authenticated Supabase user ──
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Unauthorized: missing bearer token' }, 401);

    // Use the service-role client for both auth-check and DB operations.
    // auth.getUser(jwt) validates the token regardless of which key initialized the client.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'Unauthorized: invalid token' }, 401);
    }
    // (User is authenticated — any authenticated admin can mark cheques received.)

    const { data: sponsor, error: fetchErr } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', attendeeId)
      .single();
    if (fetchErr || !sponsor) return jsonResponse({ error: 'Sponsor not found' }, 404);
    if (sponsor.payment_status === 'paid') return jsonResponse({ error: 'Already paid' }, 409);

    const updates: any = {
      payment_status: 'paid',
      payment_amount: (sponsor.payment_amount || '').replace(/\s*\(PENDING CHEQUE\)/, '').trim(),
    };
    // `.select('id')` confirms the flip actually wrote a row. Without
    // the rowcount check the function would happily insert 16 paid
    // guest seats for a sponsor whose payment_status is still pending —
    // exactly the silent-failure class we're closing across the codebase.
    const { data: updRows, error: updErr } = await supabase
      .from('attendees')
      .update(updates)
      .eq('id', attendeeId)
      .select('id');
    if (updErr) return jsonResponse({ error: updErr.message }, 500);
    if (!updRows || updRows.length === 0) {
      console.error('confirm-sponsor-cheque: payment flip touched 0 rows', { attendeeId });
      return jsonResponse({
        error: `Sponsor row ${attendeeId} could not be marked paid (0 rows affected). Refresh and retry; if the issue persists, contact engineering.`,
      }, 409);
    }

    const tier = sponsor.sponsor_tier;
    const seatCount = tier === 'signature' ? 16 : (tier === 'gold' || tier === 'silver') ? 8 : 0;
    const guestRows: any[] = [];
    if (seatCount > 0) {
      const company = sponsor.company_info || {};
      for (let i = 1; i <= seatCount; i++) {
        const gid = crypto.randomUUID();
        guestRows.push({
          id: gid,
          form_id: sponsor.form_id,
          form_title: sponsor.form_title,
          name: `${company.orgName || sponsor.name} - Guest Ticket #${i}`,
          email: sponsor.email,
          ticket_type: `${tier} seat`,
          registered_at: new Date().toISOString(),
          qr_payload: JSON.stringify({ id: gid }),
          is_primary: false,
          primary_attendee_id: sponsor.id,
          payment_status: 'paid',
          payment_method: sponsor.payment_method || 'cheque',
          guest_type: 'pending-claim',
          is_test: false,
        });
      }
      const { error: insErr } = await supabase.from('attendees').insert(guestRows);
      if (insErr) {
        // CRITICAL: sponsor is marked paid but guest seats did not persist.
        console.error('CRITICAL: Sponsor marked paid but guest rows insert failed!', JSON.stringify({
          attendeeId,
          tier,
          seatCount,
          dbError: insErr.message,
        }));
        return jsonResponse({
          error: `Sponsor was marked paid, but guest ticket rows failed to save. Please contact engineering with this reference: ${attendeeId}`,
          partial: true,
          sponsor,
        }, 500);
      }
    }

    const { data: updatedSponsor } = await supabase.from('attendees').select('*').eq('id', attendeeId).single();
    const { data: allGuests } = await supabase.from('attendees').select('*').eq('primary_attendee_id', attendeeId).eq('is_primary', false);

    return jsonResponse({ success: true, sponsor: updatedSponsor, guests: allGuests || [] });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || 'unknown' }, 500);
  }
});
