// @ts-nocheck
// bogo-send: JWT-authenticated edge function backing the portal "My Tickets"
// page's send / resend / edit-name / edit-recipient / dismiss / restore
// actions. Companion to verify-payment, which handles at-checkout BOGO
// claims. See docs/superpowers/specs/2026-05-26-bogo-gansid-design.md.
//
// Auth model: caller must be signed in. The paid attendee (or its source,
// for actions targeting a free row) MUST have user_id === auth.uid().
// Slot ownership = whoever currently holds the paid row's user_id.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildBogoRow,
  isCategoryAtOrBelowCeiling,
  checkBogoSourceEligibility,
} from '../_shared/bogoRowBuilder.ts';

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

const VALID_ACTIONS = new Set([
  'send', 'resend', 'edit-name', 'edit-recipient', 'dismiss', 'restore',
]);

function isUncommitted(free: any): boolean {
  if (free.user_id) return false;
  if (free.checked_in_at) return false;
  if (free.guest_type === 'claimed') return false;
  return true;
}

/**
 * Whether `authUid` owns `paidRow`'s BOGO slot. Direct match on `user_id`, OR
 * — for a group member whose own `user_id` is null — the purchaser who owns
 * the primary this row is linked to. Group-member rows are inserted with
 * `user_id = null` (they claim later), but the purchaser holds the BOGO slot
 * until then, so we walk up to the primary and check its `user_id`.
 */
async function ownsPaidRow(supabase: any, paidRow: any, authUid: string): Promise<boolean> {
  if (paidRow.user_id && paidRow.user_id === authUid) return true;
  if (paidRow.primary_attendee_id) {
    const { data: primary } = await supabase
      .from('attendees').select('user_id')
      .eq('id', paidRow.primary_attendee_id).maybeSingle();
    if (primary?.user_id && primary.user_id === authUid) return true;
  }
  return false;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. Resolve auth user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);
    }
    const jwt = authHeader.slice('Bearer '.length);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);
    }
    const authUid = userData.user.id;

    // 2. Parse body
    const body = await req.json();
    const action = body.action;
    if (!VALID_ACTIONS.has(action)) {
      return jsonResponse({ error: 'BAD_ACTION' }, 400);
    }

    // 3. Dispatch
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const origin = req.headers.get('origin') ?? '';

    // ── ACTION: send ──────────────────────────────────────────────────
    if (action === 'send') {
      const { paidAttendeeId, mode, guestName, guestEmail, categoryId } = body;
      if (!paidAttendeeId || typeof paidAttendeeId !== 'string') {
        return jsonResponse({ error: 'paidAttendeeId required' }, 400);
      }
      if (mode !== 'inline' && mode !== 'claim_link') {
        return jsonResponse({ error: 'BOGO_BAD_MODE' }, 400);
      }

      // Load paid + form
      const { data: paid } = await supabase
        .from('attendees').select('*').eq('id', paidAttendeeId).maybeSingle();
      if (!paid) return jsonResponse({ error: 'PAID_NOT_FOUND' }, 404);
      if (!(await ownsPaidRow(supabase, paid, authUid))) {
        return jsonResponse({ error: 'BOGO_NOT_OWNER' }, 403);
      }

      const { data: form } = await supabase
        .from('forms').select('*').eq('id', paid.form_id).maybeSingle();
      if (!form) return jsonResponse({ error: 'FORM_NOT_FOUND' }, 404);

      const eligErr = checkBogoSourceEligibility(paid, form);
      if (eligErr) return jsonResponse({ error: eligErr }, 422);

      // Slot already used?
      const { data: existing } = await supabase
        .from('attendees').select('id')
        .eq('bogo_source_attendee_id', paid.id)
        .eq('is_bogo_claim', true).limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({ error: 'BOGO_SLOT_TAKEN' }, 409);
      }

      // Inline-specific: validate ceiling
      if (mode === 'inline') {
        if (!guestName || !guestEmail || !categoryId) {
          return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
        }
        if (!/^.+@.+\..+$/.test(String(guestEmail))) {
          return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
        }
        // Fall back to form-level template id for attendees registered before
        // pricing_template_id was reliably written to the attendee row.
        const templateId = paid.pricing_template_id || form.settings?.pricingTemplateId;
        if (!templateId) {
          return jsonResponse({ error: 'BOGO_NO_TEMPLATE' }, 422);
        }
        const { data: tpl } = await supabase
          .from('pricing_templates').select('*').eq('id', templateId).maybeSingle();
        if (!tpl) return jsonResponse({ error: 'BOGO_NO_TEMPLATE' }, 422);
        if (paid.pricing_category_id && paid.pricing_tier && paid.pricing_bracket) {
          if (!isCategoryAtOrBelowCeiling(tpl, paid.pricing_category_id, paid.pricing_tier, paid.pricing_bracket, categoryId)) {
            return jsonResponse({ error: 'BOGO_PRICE_EXCEEDED' }, 422);
          }
        }
      }

      // Resolve template id once (used for the free row and ceiling check above)
      const resolvedTemplateId = paid.pricing_template_id || form.settings?.pricingTemplateId || null;

      // Build + insert row
      const row = buildBogoRow({
        paid: {
          id: paid.id,
          form_id: paid.form_id,
          form_title: paid.form_title,
          email: paid.email,
          pricing_template_id: resolvedTemplateId,
          pricing_tier: paid.pricing_tier,
          pricing_bracket: paid.pricing_bracket,
        },
        formId: paid.form_id,
        invoiceId: paid.invoice_id || paid.transaction_id || paid.id,
        mode,
        guestName,
        guestEmail,
        guestCategoryId: categoryId,
      });

      const { error: insertErr } = await supabase.from('attendees').insert([row]);
      if (insertErr) {
        // Could be the unique-index violation if a concurrent insert won.
        const isUnique = (insertErr.message || '').toLowerCase().includes('unique');
        return jsonResponse({ error: isUnique ? 'BOGO_SLOT_TAKEN' : 'INSERT_FAILED', detail: insertErr.message }, isUnique ? 409 : 500);
      }

      // Fire email (fire-and-forget so a flaky SMTP doesn't 500 the action)
      const emailMode = mode === 'inline' ? 'bogo-ticket' : 'bogo-claim-link';
      fetch(`${supabaseUrl}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: emailMode, attendeeId: row.id, origin }),
      }).catch((e: any) => console.warn('bogo-send email enqueue failed', e));

      return jsonResponse({ ok: true, freeAttendeeId: row.id, mode });
    }

    // ── ACTIONS targeting a free attendee row (resend / edit-* / dismiss / restore)
    const { freeAttendeeId } = body;
    if (!freeAttendeeId || typeof freeAttendeeId !== 'string') {
      return jsonResponse({ error: 'freeAttendeeId required' }, 400);
    }

    const { data: free } = await supabase
      .from('attendees').select('*').eq('id', freeAttendeeId).maybeSingle();
    if (!free) return jsonResponse({ error: 'FREE_NOT_FOUND' }, 404);
    if (free.is_bogo_claim !== true) return jsonResponse({ error: 'BOGO_NOT_A_CLAIM' }, 400);

    const { data: source } = free.bogo_source_attendee_id
      ? await supabase.from('attendees').select('*').eq('id', free.bogo_source_attendee_id).maybeSingle()
      : { data: null };
    if (!source) return jsonResponse({ error: 'SOURCE_NOT_FOUND' }, 404);
    if (!(await ownsPaidRow(supabase, source, authUid))) {
      return jsonResponse({ error: 'BOGO_NOT_OWNER' }, 403);
    }

    // ── ACTION: resend ────────────────────────────────────────────────
    if (action === 'resend') {
      if (free.checked_in_at) return jsonResponse({ error: 'BOGO_ALREADY_CHECKED_IN' }, 409);
      const emailMode = free.guest_type === 'pending-claim' ? 'bogo-claim-link' : 'bogo-ticket';
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: emailMode, attendeeId: free.id, origin }),
      });
      if (!resp.ok) return jsonResponse({ error: 'EMAIL_SEND_FAILED' }, 502);
      return jsonResponse({ ok: true });
    }

    // ── ACTION: edit-name ─────────────────────────────────────────────
    if (action === 'edit-name') {
      if (free.checked_in_at) return jsonResponse({ error: 'BOGO_ALREADY_CHECKED_IN' }, 409);
      const newName = String(body.guestName || '').trim();
      if (!newName) return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
      if (newName.length > 200) return jsonResponse({ error: 'NAME_TOO_LONG' }, 422);
      const { data: updated, error: uErr } = await supabase
        .from('attendees').update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', free.id).select('id');
      if (uErr) return jsonResponse({ error: uErr.message }, 500);
      if (!updated || updated.length === 0) return jsonResponse({ error: 'UPDATE_FAILED' }, 500);
      return jsonResponse({ ok: true });
    }

    // ── ACTION: edit-recipient ────────────────────────────────────────
    if (action === 'edit-recipient') {
      if (!isUncommitted(free)) return jsonResponse({ error: 'BOGO_ALREADY_COMMITTED' }, 409);

      const newName = body.guestName ? String(body.guestName).trim() : free.name;
      const newEmail = body.guestEmail ? String(body.guestEmail).trim() : free.email;
      const newCategoryId = body.categoryId !== undefined ? body.categoryId : free.pricing_category_id;

      if (!newName) return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
      if (!newEmail || !/^.+@.+\..+$/.test(newEmail)) {
        return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
      }

      // Re-validate ceiling if category changed
      if (newCategoryId && newCategoryId !== free.pricing_category_id) {
        // Fall back to the form-level template id for source rows registered
        // before pricing_template_id was reliably written (mirrors `send`).
        let templateId = source.pricing_template_id;
        if (!templateId) {
          const { data: srcForm } = await supabase
            .from('forms').select('settings').eq('id', source.form_id).maybeSingle();
          templateId = srcForm?.settings?.pricingTemplateId ?? null;
        }
        if (!templateId) {
          return jsonResponse({ error: 'BOGO_NO_TEMPLATE' }, 422);
        }
        const { data: tpl } = await supabase
          .from('pricing_templates').select('*').eq('id', templateId).maybeSingle();
        if (!tpl) return jsonResponse({ error: 'BOGO_NO_TEMPLATE' }, 422);
        // Only enforce the ceiling when the source has a full tier/bracket/
        // category to compare against; older rows may lack these.
        if (source.pricing_category_id && source.pricing_tier && source.pricing_bracket
            && !isCategoryAtOrBelowCeiling(tpl, source.pricing_category_id, source.pricing_tier, source.pricing_bracket, newCategoryId)) {
          return jsonResponse({ error: 'BOGO_PRICE_EXCEEDED' }, 422);
        }
      }

      const emailChanged = newEmail !== free.email;
      const categoryChanged = newCategoryId !== free.pricing_category_id;

      const patch: Record<string, any> = { name: newName, email: newEmail };
      if (categoryChanged) patch.pricing_category_id = newCategoryId;

      const { data: updated, error: uErr } = await supabase
        .from('attendees').update(patch).eq('id', free.id).select('id');
      if (uErr) return jsonResponse({ error: uErr.message }, 500);
      if (!updated || updated.length === 0) return jsonResponse({ error: 'UPDATE_FAILED' }, 500);

      // Re-fire ticket email if email OR category changed (recipient or QR meta changed)
      if (emailChanged || categoryChanged) {
        const emailMode = free.guest_type === 'pending-claim' ? 'bogo-claim-link' : 'bogo-ticket-updated';
        fetch(`${supabaseUrl}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: emailMode, attendeeId: free.id, origin }),
        }).catch((e: any) => console.warn('bogo edit-recipient email failed', e));
      }
      return jsonResponse({ ok: true });
    }

    // ── ACTION: dismiss ───────────────────────────────────────────────
    if (action === 'dismiss') {
      const { data: updated, error: uErr } = await supabase
        .from('attendees')
        .update({ bogo_dismissed_by_payer_at: new Date().toISOString() })
        .eq('id', free.id).select('id');
      if (uErr) return jsonResponse({ error: uErr.message }, 500);
      if (!updated || updated.length === 0) return jsonResponse({ error: 'UPDATE_FAILED' }, 500);
      return jsonResponse({ ok: true });
    }

    // ── ACTION: restore ───────────────────────────────────────────────
    if (action === 'restore') {
      const { data: updated, error: uErr } = await supabase
        .from('attendees')
        .update({ bogo_dismissed_by_payer_at: null })
        .eq('id', free.id).select('id');
      if (uErr) return jsonResponse({ error: uErr.message }, 500);
      if (!updated || updated.length === 0) return jsonResponse({ error: 'UPDATE_FAILED' }, 500);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'BAD_ACTION' }, 400);
  } catch (e: any) {
    console.error('bogo-send error', e);
    return jsonResponse({ error: e?.message || 'Unknown error' }, 500);
  }
});
