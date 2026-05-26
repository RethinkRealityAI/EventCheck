// @ts-nocheck
// admin-cancel-attendee: admin-only edge function that hard-deletes an
// attendee row and cascades to any linked BOGO free guest (with a
// "withdrawn" notification email).
//
// Today's attendee-delete UI calls Supabase directly via storageService;
// that flow ignores BOGO links and leaves orphaned free rows that point
// at a paid row that no longer exists (the FK is ON DELETE SET NULL, so
// the row survives but its source pointer is null — a "ghost" free
// ticket with no audit trail of who paid for it).
//
// This function is the canonical cancellation path going forward: it
// finds linked BOGO free rows, emails the recipients (capturing
// name/email BEFORE delete since the row's about to vanish), hard-deletes
// the free rows, then hard-deletes the paid row.
//
// Auth: caller must be admin or super_admin. Verified by reading the
// caller's profile row by user_id.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Auth — admin or super_admin only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);
    const jwt = authHeader.slice('Bearer '.length);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (!profile) return jsonResponse({ error: 'NO_PROFILE' }, 403);
    if (profile.role !== 'admin' && profile.role !== 'super_admin') {
      return jsonResponse({ error: 'NOT_ADMIN' }, 403);
    }

    // 2. Body
    const body = await req.json();
    const { attendeeId } = body;
    if (!attendeeId || typeof attendeeId !== 'string') {
      return jsonResponse({ error: 'attendeeId required' }, 400);
    }

    // 3. Load target
    const { data: target } = await supabase
      .from('attendees').select('*').eq('id', attendeeId).maybeSingle();
    if (!target) return jsonResponse({ error: 'ATTENDEE_NOT_FOUND' }, 404);

    // 4. Find linked BOGO free rows that reference this row as their source.
    //    (If we're deleting a BOGO free row itself, there's no cascade — its
    //    source is unaffected and the slot becomes "used" forever, by design.
    //    Admin must explicitly delete the source if they want to free the slot.)
    const { data: linkedFree } = await supabase
      .from('attendees')
      .select('id, name, email')
      .eq('bogo_source_attendee_id', attendeeId)
      .eq('is_bogo_claim', true);

    const { data: form } = await supabase
      .from('forms').select('title').eq('id', target.form_id).maybeSingle();
    const eventName = form?.title || 'the event';

    // 5. For each linked free row, fire the withdrawal email (capture
    //    name/email BEFORE delete since the row vanishes). Fire-and-forget
    //    — failed emails shouldn't block the cancellation.
    if (linkedFree && linkedFree.length > 0) {
      for (const f of linkedFree) {
        if (!f.email) continue;
        fetch(`${supabaseUrl}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'bogo-ticket-withdrawn',
            guestEmail: f.email,
            guestName: f.name,
            payerName: target.name,
            eventName,
          }),
        }).catch((e: any) => console.warn('bogo withdrawn email failed', e));
      }

      // 6. Hard-delete free rows (rowcount-checked per CLAUDE.md rule 4)
      const freeIds = linkedFree.map((f: any) => f.id);
      const { data: deletedFree, error: delFreeErr } = await supabase
        .from('attendees').delete().in('id', freeIds).select('id');
      if (delFreeErr) {
        return jsonResponse({ error: 'Failed to delete linked BOGO rows: ' + delFreeErr.message }, 500);
      }
      if (!deletedFree || deletedFree.length !== freeIds.length) {
        console.warn('admin-cancel: expected to delete', freeIds.length, 'free rows, got', deletedFree?.length);
      }
    }

    // 7. Hard-delete the paid row
    const { data: deletedPaid, error: delPaidErr } = await supabase
      .from('attendees').delete().eq('id', attendeeId).select('id');
    if (delPaidErr) {
      return jsonResponse({ error: 'Failed to delete attendee: ' + delPaidErr.message }, 500);
    }
    if (!deletedPaid || deletedPaid.length === 0) {
      return jsonResponse({ error: 'Attendee delete affected 0 rows (RLS or stale ID)' }, 500);
    }

    return jsonResponse({
      ok: true,
      deletedAttendeeId: attendeeId,
      cascadedBogoFreeCount: linkedFree?.length ?? 0,
    });
  } catch (e: any) {
    console.error('admin-cancel-attendee error', e);
    return jsonResponse({ error: e?.message || 'Unknown error' }, 500);
  }
});
