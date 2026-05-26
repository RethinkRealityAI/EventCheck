// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildBogoRow,
  isCategoryAtOrBelowCeiling,
} from '../_shared/bogoRowBuilder.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── BOGO claim validation + insert helper ─────────────────────────────────
// Used by both the group and solo dynamic-pricing branches. Validates the
// bogoClaims array against the resolved payer rows, builds free attendee
// rows via the shared helper, inserts them, and fires emails for each.
//
// Returns { partialBogoFailure: boolean }. NEVER throws — partial failure
// means the paid rows already succeeded and we don't want to surface 500
// for a $0 row that the user can retry from the portal.
async function processBogoClaims(args: {
  supabase: any;
  paidRows: Array<any>; // ordered to match bogoClaims[].paidIndex
  bogoClaims: Array<any>;
  invoiceId: string;
  formId: string;
  formSettings: any;
  formTitle: string | null;
  serviceRoleKey: string;
  supabaseUrl: string;
  origin: string;
}): Promise<{ partialBogoFailure: boolean }> {
  const { supabase, paidRows, bogoClaims, invoiceId, formId, formTitle, serviceRoleKey, supabaseUrl, origin } = args;
  if (!bogoClaims || bogoClaims.length === 0) return { partialBogoFailure: false };

  // Build free rows. Per spec, free row inherits payer's tier+bracket — the
  // ceiling is enforced at PAYER's tier+bracket, not the guest's.
  const bogoRows = bogoClaims.map((claim: any) => {
    const paid = paidRows[claim.paidIndex];
    return buildBogoRow({
      paid: {
        id: paid.id,
        form_id: paid.form_id,
        form_title: paid.form_title ?? formTitle,
        email: paid.email,
        pricing_template_id: paid.pricing_template_id,
        pricing_tier: paid.pricing_tier,
        pricing_bracket: paid.pricing_bracket,
      },
      formId,
      invoiceId,
      mode: claim.mode,
      guestName: claim.guestName,
      guestEmail: claim.guestEmail,
      guestCategoryId: claim.categoryId,
    });
  });

  const { data: inserted, error: bogoErr } = await supabase
    .from('attendees').insert(bogoRows).select('id');

  if (bogoErr || !inserted || inserted.length !== bogoRows.length) {
    console.error('[verify-payment] BOGO insert partial failure', JSON.stringify({
      error: bogoErr?.message,
      expected: bogoRows.length,
      got: inserted?.length ?? 0,
    }));
    return { partialBogoFailure: true };
  }

  // Fire emails (fire-and-forget). Mode 'inline' → ticket to guest;
  // mode 'claim_link' → claim link to payer.
  const emailFnUrl = `${supabaseUrl}/functions/v1/send-ticket-email`;
  for (let i = 0; i < bogoClaims.length; i++) {
    const claim = bogoClaims[i];
    const row = bogoRows[i];
    const mode = claim.mode === 'inline' ? 'bogo-ticket' : 'bogo-claim-link';
    fetch(emailFnUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode, attendeeId: row.id, origin }),
    }).catch((e: any) => console.warn('BOGO email failed', e));
  }

  return { partialBogoFailure: false };
}

// Validates bogoClaims request shape against per-member pricing resolutions.
// Runs BEFORE PayPal capture so we 422 cleanly without taking money.
// Returns null when valid, or a Response (already a 422) when not.
function validateBogoClaimsPreCapture(args: {
  bogoClaims: Array<any>;
  memberCount: number;
  formSettings: any;
  tpl: any;
  payerResolutionByIndex: Array<{ tierId: string; bracketId: string; categoryId: string }>;
}): Response | null {
  const { bogoClaims, memberCount, formSettings, tpl, payerResolutionByIndex } = args;
  if (!bogoClaims || bogoClaims.length === 0) return null;
  if (!formSettings?.bogoEnabled) {
    return jsonResponse({ error: 'BOGO_NOT_ENABLED' }, 422);
  }
  const seenIdxs = new Set<number>();
  for (const claim of bogoClaims) {
    if (typeof claim.paidIndex !== 'number' || claim.paidIndex < 0 || claim.paidIndex >= memberCount) {
      return jsonResponse({ error: 'BOGO_BAD_INDEX' }, 422);
    }
    if (seenIdxs.has(claim.paidIndex)) {
      return jsonResponse({ error: 'BOGO_DUPLICATE_SOURCE' }, 422);
    }
    seenIdxs.add(claim.paidIndex);
    if (claim.mode !== 'inline' && claim.mode !== 'claim_link') {
      return jsonResponse({ error: 'BOGO_BAD_MODE' }, 422);
    }
    if (claim.mode === 'inline') {
      if (!claim.guestName || typeof claim.guestName !== 'string' || claim.guestName.trim().length === 0) {
        return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
      }
      if (!claim.guestEmail || !/^.+@.+\..+$/.test(String(claim.guestEmail))) {
        return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
      }
      if (!claim.categoryId || typeof claim.categoryId !== 'string') {
        return jsonResponse({ error: 'BOGO_MISSING_FIELDS' }, 422);
      }
      const payer = payerResolutionByIndex[claim.paidIndex];
      if (!payer) return jsonResponse({ error: 'BOGO_BAD_INDEX' }, 422);
      if (!isCategoryAtOrBelowCeiling(tpl, payer.categoryId, payer.tierId, payer.bracketId, claim.categoryId)) {
        return jsonResponse({ error: 'BOGO_PRICE_EXCEEDED' }, 422);
      }
    }
  }
  return null;
}

interface TicketItem {
  id: string;
  name: string;
  price: number;
  inventory: number;
  maxPerOrder: number;
  seats?: number;
}

interface PromoCode {
  code: string;
  value: number;
  type: 'percent' | 'fixed';
}

interface TicketConfig {
  currency: string;
  items: TicketItem[];
  promoCodes?: PromoCode[];
}

interface FormField {
  id: string;
  type: string;
  ticketConfig?: TicketConfig;
  [key: string]: any;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      paypalOrderId,
      attendees,
      // Secure server-validated parameters
      formId,
      ticketQuantities,
      promoCode,
      donatedSeats: clientDonatedSeats,
      mode: clientMode,
      paymentMethod,
      sponsorMeta,
      // Legacy parameters (backward compat only — used when formId is absent)
      expectedAmount: legacyExpectedAmount,
      expectedCurrency: legacyExpectedCurrency,
    } = body;

    // ── JWT: derive user_id server-side from Authorization header ──
    // Anonymous submissions (no auth header) proceed normally with user_id = null.
    // The client NEVER supplies user_id directly — that would be forgeable.
    let authUserId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.slice('Bearer '.length);
      try {
        const adminClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
        if (!userErr && userData?.user) {
          if (!userData.user.email_confirmed_at) {
            return new Response(
              JSON.stringify({ error: 'email_not_verified', message: 'Please verify your email before registering.' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          authUserId = userData.user.id;
        }
      } catch (e) {
        console.error('verify-payment: JWT verification failed', e);
        // Continue with authUserId = null — anonymous submissions are allowed
      }
    }

    // ── EXHIBITOR BRANCH: no PayPal, no attendees array — just insert rows ──
    if (body.exhibitorSubmission === true) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Validate the form is exhibitor type
      const { data: exhibitorForm, error: fErr } = await supabase
        .from('forms').select('form_type').eq('id', formId).maybeSingle();
      if (fErr || !exhibitorForm) return jsonResponse({ error: 'Form not found' }, 404);
      if (exhibitorForm.form_type !== 'exhibitor') {
        return jsonResponse({ error: 'Not an exhibitor form' }, 400);
      }

      const org = body.org;
      const staffFormId = body.staffFormId;
      const staffMembers = Array.isArray(body.staff) ? body.staff : [];
      if (!org || !staffFormId || staffMembers.length === 0) {
        return jsonResponse({ error: 'Missing org, staffFormId, or staff' }, 400);
      }

      // 1. Insert the org primary row
      const orgId = crypto.randomUUID();
      const orgRow = {
        id: orgId,
        form_id: formId,
        name: `${org.orgName} — Contact`,
        email: org.contactEmail,
        ticket_type: 'Exhibitor',
        is_primary: true,
        payment_status: 'paid',
        payment_amount: 'PAID EXTERNALLY',
        qr_payload: JSON.stringify({ id: orgId }),
        user_id: authUserId,
        company_info: {
          orgName: org.orgName,
          tier: org.tier,
          additionalSqm: org.additionalSqm,
          contactName: org.contactName,
          contactEmail: org.contactEmail,
          contactPhone: org.contactPhone,
        },
      };

      const { error: orgErr } = await supabase.from('attendees').insert([orgRow]);
      if (orgErr) return jsonResponse({ error: 'Failed to save org: ' + orgErr.message }, 500);

      // 2. Insert N staff rows on the staff form
      const staffRows = staffMembers.map((s: any) => {
        const id = crypto.randomUUID();
        return {
          id,
          form_id: staffFormId,
          name: s.name,
          email: s.email,
          ticket_type: 'Exhibitor Staff',
          is_primary: false,
          primary_attendee_id: orgId,
          guest_type: 'exhibitor-staff-pending',
          payment_status: 'paid',
          payment_amount: 'PAID EXTERNALLY',
          qr_payload: JSON.stringify({ id }),
          answers: { exhibitor_staff_category: s.category },
        };
      });

      const { error: staffErr } = await supabase.from('attendees').insert(staffRows);
      if (staffErr) {
        // Roll back the org row so retries don't create duplicate orgs
        // and we don't leave behind an orphaned 'paid' row with no staff.
        // The org row was inserted in step 1 and is the only thing
        // pointing at this orgId, so a delete is safe here.
        const { error: rollbackErr } = await supabase.from('attendees').delete().eq('id', orgId);
        if (rollbackErr) {
          console.error('CRITICAL: org rollback failed after staff insert failed', JSON.stringify({
            orgId,
            staffErr: staffErr.message,
            rollbackErr: rollbackErr.message,
          }));
          return jsonResponse({
            error: `Staff insert failed AND org rollback failed. Orphaned org row id=${orgId} requires manual cleanup. Engineering reference: ${orgId}.`,
            partial: true,
            orphanedOrgId: orgId,
          }, 500);
        }
        console.error('Org rolled back after staff insert failure', JSON.stringify({ orgId, error: staffErr.message }));
        return jsonResponse({ error: 'Failed to save staff: ' + staffErr.message + '. Org rolled back; please retry.' }, 500);
      }

      // 3. Fire per-staff invitation emails (fire-and-forget)
      const emailFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`;
      for (const row of staffRows) {
        fetch(emailFnUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'exhibitor-staff-invite',
            attendeeId: row.id,
            origin: req.headers.get('origin') ?? '',
          }),
        }).catch(e => console.warn('Exhibitor staff invite email failed', e));
      }

      return jsonResponse({ ok: true, orgId, staffIds: staffRows.map((r: any) => r.id) });
    }
    // ── END EXHIBITOR BRANCH ──

    // ── SPONSOR_EXHIBITOR BRANCH: payment-free flow for the combined sponsor_exhibitor form_type.
    //    Sponsors and exhibitors have paid externally (wire / cheque / P.O.), so we skip PayPal
    //    entirely. The primary row carries either sponsor_tier OR exhibitor_booth_type (XOR,
    //    enforced by the client-side validation + re-checked here). N staff rows are inserted
    //    with primary_attendee_id, guest_type='staff-pending' (for send-links) or null (inline).
    //    Quotas enforced server-side mirroring the client's EXHIBITOR_BOOTH_TYPES + sponsor tier
    //    data — do not import from client code (this runs under Deno).
    if (body.sponsorExhibitorSubmission === true) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const {
        registrationType, org,
        sponsorTier,
        boothType,
        hasAllDetails, staff, consents,
        staffFormId: bodyStaffFormId,
        extras: bodyExtras,
      } = body;
      const extrasArr: any[] = Array.isArray(bodyExtras) ? bodyExtras : [];

      // ─── Basic validation ───
      if (registrationType !== 'sponsor' && registrationType !== 'exhibitor') {
        return jsonResponse({ error: 'registrationType must be sponsor or exhibitor' }, 400);
      }
      const hasTier = !!sponsorTier;
      const hasBooth = !!boothType;
      if (hasTier === hasBooth) {
        return jsonResponse({ error: 'Exactly one of sponsorTier or boothType required' }, 400);
      }
      if (!org?.orgName || !org?.contactName || !org?.email) {
        return jsonResponse({ error: 'org.orgName, contactName, email required' }, 400);
      }
      if (!consents?.terms || !consents?.disclaimer || !consents?.photo) {
        return jsonResponse({ error: 'All three consents must be accepted' }, 400);
      }
      if (!formId) {
        return jsonResponse({ error: 'formId required' }, 400);
      }
      const staffArr: any[] = Array.isArray(staff) ? staff : [];

      // Validate form_type matches and resolve the staff form ID (falls back to form settings).
      const { data: formRow, error: fErr } = await supabase
        .from('forms').select('form_type, settings').eq('id', formId).maybeSingle();
      if (fErr || !formRow) return jsonResponse({ error: 'Form not found' }, 404);
      if (formRow.form_type !== 'sponsor_exhibitor') {
        return jsonResponse({ error: 'Not a sponsor_exhibitor form' }, 400);
      }
      // staffFormId MUST be a separate registration form. Falling back to `formId`
      // (the combined sponsor_exhibitor form) would point staff rows at a form
      // with no fields, breaking the `?ref=` claim flow. Hard-fail server-side
      // rather than silently producing invitations to a dead form.
      const staffFormId: string | undefined = bodyStaffFormId
        || (formRow.settings as any)?.staffFormId
        || undefined;
      if (!staffFormId || staffFormId === formId) {
        return jsonResponse({
          error: 'sponsor_exhibitor form is misconfigured: form.settings.staffFormId must reference a separate companion registration form (cannot equal the combined form id).',
        }, 400);
      }

      // ─── Staff quota validation (server-side mirror of client validation) ───
      // Both sponsor tiers and exhibitor booths expose the same Hall-Only +
      // Full-Congress staff quota shape, so the validation is uniform.
      const BOOTH_QUOTAS: Record<string, { hall_only: number; full_access: number }> = {
        booth_3x3_corner:            { hall_only: 4, full_access: 2 },
        booth_3x3:                   { hall_only: 4, full_access: 2 },
        booth_3x6_corner:            { hall_only: 6, full_access: 4 },
        booth_3x6_inline:            { hall_only: 6, full_access: 4 },
        booth_nonprofit:             { hall_only: 2, full_access: 1 },
        booth_commercial_publishers: { hall_only: 2, full_access: 1 },
      };
      const SPONSOR_TIER_QUOTAS: Record<string, { hall_only: number; full_access: number }> = {
        platinum: { hall_only: 12, full_access: 6 },
        gold:     { hall_only: 8,  full_access: 4 },
        silver:   { hall_only: 6,  full_access: 3 },
        bronze:   { hall_only: 4,  full_access: 2 },
      };

      let quota: { hall_only: number; full_access: number } | null = null;
      if (boothType) {
        quota = BOOTH_QUOTAS[boothType] || null;
        if (!quota) return jsonResponse({ error: `Unknown boothType: ${boothType}` }, 400);
      } else if (sponsorTier) {
        quota = SPONSOR_TIER_QUOTAS[sponsorTier] || null;
        if (!quota) return jsonResponse({ error: `Unknown sponsorTier: ${sponsorTier}` }, 400);
      }

      if (quota) {
        const ho = staffArr.filter((s: any) => s.category === 'hall_only').length;
        const fa = staffArr.filter((s: any) => s.category === 'full_access').length;
        if (ho > quota.hall_only || fa > quota.full_access) {
          return jsonResponse({ error: 'Staff count exceeds tier/booth quota' }, 400);
        }
      }

      // Reject stale clients sending legacy 'sponsor_seat' category
      for (const s of staffArr) {
        if (s.category !== 'hall_only' && s.category !== 'full_access') {
          return jsonResponse({ error: `Invalid staff category: ${s.category}` }, 400);
        }
      }

      // ─── Paid extras validation + PayPal capture ───
      // Tier/booth pricing is invoiced externally as before. The only
      // amount we capture through PayPal in this branch is the optional
      // additional booth staff at $50 USD each (cap 10).
      const EXTRA_UNIT_PRICE = 50; // USD
      const EXTRA_MAX = 10;
      if (extrasArr.length > EXTRA_MAX) {
        return jsonResponse({ error: `extras count ${extrasArr.length} exceeds cap of ${EXTRA_MAX}` }, 400);
      }
      const isEmailStr = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
      for (let i = 0; i < extrasArr.length; i++) {
        const e = extrasArr[i];
        if (!e?.name?.trim()) return jsonResponse({ error: `extras[${i}].name required` }, 400);
        if (!isEmailStr(e?.email)) return jsonResponse({ error: `extras[${i}].email invalid` }, 400);
        if (e.category !== 'hall_only' && e.category !== 'full_access') {
          return jsonResponse({ error: `extras[${i}].category invalid` }, 400);
        }
      }

      // Capture PayPal order when there are paid extras. Mirrors the
      // sponsor PayPal branch below: env-aware sandbox/live resolution,
      // OAuth, capture, amount check.
      let extrasTransactionId: string | null = null;
      let extrasPaymentAmount: string | null = null;
      if (extrasArr.length > 0) {
        if (!paypalOrderId) {
          return jsonResponse({ error: 'paypalOrderId required for paid extras' }, 400);
        }
        const expectedExtrasTotal = extrasArr.length * EXTRA_UNIT_PRICE;

        const paypalMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
        const origin = (req.headers.get('origin') || '').toLowerCase();
        const isLocalhost = origin !== '' && (origin.includes('localhost') || origin.includes('127.0.0.1'));
        let useSandbox: boolean;
        if (isLocalhost) useSandbox = true;
        else if (paypalMode === 'production') useSandbox = false;
        else if (paypalMode === 'sandbox') useSandbox = true;
        else useSandbox = false;

        const PP_CLIENT_ID = (useSandbox
          ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID'))
          : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
        const PP_CLIENT_SECRET = (useSandbox
          ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET'))
          : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
        const PP_API_BASE = Deno.env.get('PAYPAL_API_BASE')
          || (useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
        if (!PP_CLIENT_ID || !PP_CLIENT_SECRET) {
          return jsonResponse({ error: 'PayPal credentials not configured' }, 500);
        }

        const authResp = await fetch(`${PP_API_BASE}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${PP_CLIENT_ID}:${PP_CLIENT_SECRET}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (!authResp.ok) return jsonResponse({ error: 'PayPal auth failed' }, 502);
        const { access_token } = await authResp.json();

        const capResp = await fetch(`${PP_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        });
        const capData = await capResp.json();
        if (!capResp.ok || capData.status !== 'COMPLETED') {
          const issue = capData?.details?.[0]?.issue || capData?.name || capData?.message || 'unknown';
          const debugId = capData?.debug_id || '';
          console.error('[verify-payment se-extras] PayPal capture failed', JSON.stringify({ issue, debugId, useSandbox, apiBase: PP_API_BASE, orderId: paypalOrderId }));
          return jsonResponse({ error: `PayPal capture failed: ${issue}${debugId ? ` (debug_id: ${debugId})` : ''}` }, 502);
        }
        const capture = capData.purchase_units?.[0]?.payments?.captures?.[0];
        if (!capture) return jsonResponse({ error: 'No capture data' }, 502);

        // Duplicate transaction guard — refuse to insert two registrations
        // for the same PayPal capture id.
        const { data: existingTx } = await supabase
          .from('attendees').select('id').eq('transaction_id', capture.id).limit(1);
        if (existingTx && existingTx.length > 0) {
          return jsonResponse({ error: 'This payment has already been processed' }, 409);
        }

        const capturedAmount = parseFloat(capture.amount.value);
        const capturedCurrency = capture.amount.currency_code;
        if (Math.abs(capturedAmount - expectedExtrasTotal) > 0.01) {
          return jsonResponse({
            error: `Extras amount mismatch. Expected: $${expectedExtrasTotal} USD, Captured: ${capturedAmount} ${capturedCurrency}`,
          }, 422);
        }
        if (capturedCurrency !== 'USD') {
          return jsonResponse({ error: `Extras currency must be USD, got ${capturedCurrency}` }, 422);
        }
        extrasTransactionId = capture.id;
        extrasPaymentAmount = `${capturedAmount} ${capturedCurrency}`;
      }

      // ─── Insert primary attendee ───
      // When the user paid for extras, the primary row shares the PayPal
      // transaction_id (so the dashboard can group the whole submission).
      // Otherwise we generate a random UUID (the existing "external pay"
      // pattern). Either way, the primary row's payment_method stays
      // 'external' because tier/booth pricing is invoiced separately;
      // the captured PayPal amount is just the extras subtotal.
      const transactionId = extrasTransactionId ?? crypto.randomUUID();
      const primaryId = crypto.randomUUID();
      const primary: Record<string, any> = {
        id: primaryId,
        form_id: formId,
        name: org.orgName,
        email: org.email,
        ticket_type: registrationType === 'sponsor' ? 'Sponsor' : 'Exhibitor',
        payment_status: 'paid',
        payment_amount: extrasPaymentAmount
          ? `Extras: ${extrasPaymentAmount}; Tier: PAID EXTERNALLY`
          : 'PAID EXTERNALLY',
        payment_method: 'external',
        // QR payload must be `{ id }` so the door scanner's handleScan can
        // resolve it via getAttendee. Earlier shapes like `{ t, i }` rendered
        // a valid QR but every scan returned "Invalid Ticket".
        qr_payload: JSON.stringify({ id: primaryId }),
        registered_at: new Date().toISOString(),
        transaction_id: transactionId,
        is_primary: true,
        user_id: authUserId,
        company_info: org,
        answers: { registrationType, hasAllDetails },
      };
      if (sponsorTier) {
        primary.sponsor_tier = sponsorTier;
      } else {
        primary.exhibitor_booth_type = boothType;
      }

      const { data: primaryRow, error: primaryErr } = await supabase
        .from('attendees').insert(primary).select('id').single();
      if (primaryErr) return jsonResponse({ error: primaryErr.message }, 500);

      // ─── Insert staff rows ───
      // Staff rows point at `staffFormId` (the companion registration form that collects
      // personal details), NOT the combined-form id — otherwise the claim link
      // (`?ref=<staffId>`) lands on the empty `sponsor_exhibitor` form and the staff member
      // can't complete registration. This mirrors the legacy exhibitor branch.
      // Placeholder emails use '' (not NULL) to satisfy the `attendees.email NOT NULL`
      // constraint from the initial schema.
      const staffRows = staffArr.map((s: any, i: number) => {
        const isPlaceholder = !s.name?.trim() && !s.email?.trim();
        const id = crypto.randomUUID();
        const base: Record<string, any> = {
          id,
          form_id: staffFormId,
          name: isPlaceholder ? `${org.orgName} — Staff slot #${i + 1}` : s.name,
          email: isPlaceholder ? '' : s.email,
          ticket_type: s.category === 'full_access' ? 'Full Congress' : 'Hall Only',
          payment_status: 'paid',
          payment_amount: 'PAID EXTERNALLY',
          payment_method: 'external',
          qr_payload: JSON.stringify({ id }),
          registered_at: new Date().toISOString(),
          transaction_id: transactionId,
          is_primary: false,
          primary_attendee_id: primaryRow.id,
          user_id: null,
          answers: hasAllDetails && !isPlaceholder
            ? { ...(s.fullAnswers || {}), staffCategory: s.category }
            : { staffCategory: s.category },
          guest_type: hasAllDetails && !isPlaceholder ? null : 'staff-pending',
        };
        return base;
      });

      let staffIds: string[] = [];
      if (staffRows.length > 0) {
        const { data: staffData, error: staffErr } = await supabase
          .from('attendees').insert(staffRows).select('id');
        if (staffErr) return jsonResponse({ error: staffErr.message }, 500);
        staffIds = (staffData || []).map((r: any) => r.id);
      }

      // ─── Insert paid extras (only when extras.length > 0) ───
      // These mirror the tier-staff row shape but carry payment_method='paypal'
      // and the captured PayPal amount, and are flagged with is_paid_extra=true
      // so the admin dashboard can distinguish them. Names/emails are always
      // present (no placeholder/claim-link flow for paid extras), so guest_type
      // is always 'staff-pending' — they still need to claim their personal
      // details on the staff form via `?ref=` link.
      let extrasIds: string[] = [];
      if (extrasArr.length > 0 && extrasTransactionId) {
        const extraRows = extrasArr.map((e: any) => {
          const id = crypto.randomUUID();
          return {
            id,
            form_id: staffFormId,
            name: e.name,
            email: e.email,
            ticket_type: e.category === 'full_access' ? 'Full Congress (Extra)' : 'Hall Only (Extra)',
            payment_status: 'paid',
            payment_amount: `$${EXTRA_UNIT_PRICE}.00 USD`,
            payment_method: 'paypal',
            qr_payload: JSON.stringify({ id }),
            registered_at: new Date().toISOString(),
            transaction_id: extrasTransactionId,
            is_primary: false,
            primary_attendee_id: primaryRow.id,
            user_id: null,
            answers: { staffCategory: e.category },
            guest_type: 'staff-pending',
            is_paid_extra: true,
          };
        });
        const { data: extraData, error: extrasErr } = await supabase
          .from('attendees').insert(extraRows).select('id');
        if (extrasErr) {
          // CRITICAL: PayPal already captured, primary + tier staff already inserted,
          // but extras failed. Log for manual reconciliation; refund/retry decisions
          // are handled out-of-band.
          console.error('CRITICAL: sponsor_exhibitor extras insert failed after PayPal capture', JSON.stringify({
            transactionId: extrasTransactionId,
            primaryId,
            extrasCount: extrasArr.length,
            dbError: extrasErr.message,
          }));
          return jsonResponse({
            error: `Your payment was processed but we encountered a database error saving the additional staff. Please contact the event organizers with this reference: ${extrasTransactionId}`,
          }, 500);
        }
        extrasIds = (extraData || []).map((r: any) => r.id);
      }

      return jsonResponse({
        ok: true,
        primaryId: primaryRow.id,
        staffIds,
        extrasIds,
        transactionId,
        extrasTransactionId,
      });
    }
    // ── END SPONSOR_EXHIBITOR BRANCH ──

    if (!attendees || attendees.length === 0) {
      return jsonResponse({ error: 'Missing required field: attendees' }, 400);
    }

    // ── SPONSOR BRANCH: special handling before the standard event flow ──
    if (sponsorMeta) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ─── Validate sponsorMeta shape ───
      if (!sponsorMeta.items || !Array.isArray(sponsorMeta.items) || sponsorMeta.items.length === 0) {
        return jsonResponse({ error: 'Invalid sponsorMeta: items must be a non-empty array' }, 400);
      }
      if (typeof sponsorMeta.total !== 'number' || !Number.isFinite(sponsorMeta.total) || sponsorMeta.total <= 0) {
        return jsonResponse({ error: 'Invalid sponsorMeta: total must be positive' }, 400);
      }
      if (!formId) {
        return jsonResponse({ error: 'formId required for sponsor submission' }, 400);
      }

      // ─── Server-side price recomputation from the form's ticketConfig ───
      // Prevents a tampered client from claiming a high-value tier at a low price.
      const supabaseUrlForFormLookup = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKeyForFormLookup = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const formLookupClient = createClient(supabaseUrlForFormLookup, supabaseServiceKeyForFormLookup);
      const { data: formRow, error: formErr } = await formLookupClient
        .from('forms')
        .select('fields, form_type')
        .eq('id', formId)
        .single();
      if (formErr || !formRow) {
        return jsonResponse({ error: 'Form not found for sponsor submission' }, 404);
      }
      if (formRow.form_type !== 'sponsor') {
        return jsonResponse({ error: 'Form is not a sponsor form' }, 400);
      }
      const formFields = (typeof formRow.fields === 'string' ? JSON.parse(formRow.fields) : formRow.fields) as any[];
      const ticketField = formFields.find((f: any) => f.type === 'ticket');
      if (!ticketField?.ticketConfig?.items) {
        return jsonResponse({ error: 'Sponsor form has no ticket config' }, 500);
      }
      const catalogById = new Map<string, { price: number; name: string; maxPerOrder: number; itemCategory?: string }>();
      for (const i of ticketField.ticketConfig.items) {
        catalogById.set(i.id, { price: i.price, name: i.name, maxPerOrder: i.maxPerOrder, itemCategory: i.itemCategory });
      }

      // Recompute expected subtotal + HST from the form's catalog
      let expectedSubtotal = 0;
      let expectedBoothSubtotal = 0;
      for (const item of sponsorMeta.items) {
        const catalog = catalogById.get(item.key);
        if (!catalog) {
          return jsonResponse({ error: `Unknown item: ${item.key}` }, 400);
        }
        if (!Number.isInteger(item.qty) || item.qty <= 0 || item.qty > catalog.maxPerOrder) {
          return jsonResponse({ error: `Invalid qty for item ${item.key}` }, 400);
        }
        const lineTotal = catalog.price * item.qty;
        expectedSubtotal += lineTotal;
        if (catalog.itemCategory === 'booth') expectedBoothSubtotal += lineTotal;
      }

      // Fetch HST rate from app_settings
      const { data: settingsRow } = await formLookupClient
        .from('app_settings')
        .select('sponsor_hst_rate')
        .eq('id', 1)
        .single();
      const hstRate = Number(settingsRow?.sponsor_hst_rate ?? 0.13);
      const expectedHst = expectedBoothSubtotal * hstRate;
      const expectedTotal = expectedSubtotal + expectedHst;

      // Validate client's claimed total matches what the server computed (1-cent tolerance)
      if (Math.abs(Number(sponsorMeta.total) - expectedTotal) > 0.01) {
        return jsonResponse({
          error: `Total mismatch. Client: ${sponsorMeta.total}, Server: ${expectedTotal.toFixed(2)}`,
        }, 422);
      }

      // Use the server-computed total for all downstream checks
      const computedTotal = expectedTotal;
      const currency = 'CAD';

      const primary = attendees[0];
      primary.sponsor_tier = sponsorMeta.tier || null;
      primary.sponsor_items = sponsorMeta.items || [];
      primary.company_info = sponsorMeta.companyInfo || {};
      primary.sponsored_awards = sponsorMeta.sponsoredAwards || [];
      primary.payment_method = paymentMethod === 'cheque' ? 'cheque' : 'paypal';

      // ─── CHEQUE: skip PayPal, save pending, no guest tickets yet ───
      if (paymentMethod === 'cheque') {
        // Validate the client-supplied primary.id is a UUID and does not
        // collide with an existing row owned by a different user. The
        // upsert below trusts the id wholesale — without this guard a
        // buggy or malicious client could overwrite a paid attendee
        // record by sending the victim's id with their own payload.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!primary.id || typeof primary.id !== 'string' || !UUID_RE.test(primary.id)) {
          return jsonResponse({ error: 'primary attendee id must be a UUID' }, 400);
        }
        const { data: existing, error: existingErr } = await supabase
          .from('attendees')
          .select('id, user_id, form_id, payment_status')
          .eq('id', primary.id)
          .maybeSingle();
        if (existingErr) {
          console.error('verify-payment cheque: collision check failed', existingErr);
          return jsonResponse({ error: 'Collision check failed: ' + existingErr.message }, 500);
        }
        if (existing) {
          // Allow the same user to re-submit (idempotent retry) but
          // reject any cross-user / cross-form / paid-overwrite attempt.
          const sameUser = existing.user_id && authUserId && existing.user_id === authUserId;
          const sameForm = existing.form_id === primary.form_id;
          const isPaid = existing.payment_status === 'paid';
          if (!sameUser || !sameForm || isPaid) {
            console.error('verify-payment cheque: id collision rejected', {
              attemptedId: primary.id,
              existingUserId: existing.user_id,
              callerUserId: authUserId,
              existingFormId: existing.form_id,
              callerFormId: primary.form_id,
              existingPaymentStatus: existing.payment_status,
            });
            return jsonResponse({ error: 'Attendee id collision; refresh and retry' }, 409);
          }
        }
        primary.payment_status = 'pending';
        primary.payment_amount = `${computedTotal.toFixed(2)} ${currency} (PENDING CHEQUE)`;
        primary.user_id = authUserId;
        const { data: upserted, error } = await supabase
          .from('attendees')
          .upsert([primary])
          .select('id');
        if (error) return jsonResponse({ error: error.message }, 500);
        if (!upserted || upserted.length === 0) {
          console.error('verify-payment cheque: upsert touched 0 rows', { id: primary.id });
          return jsonResponse({ error: 'Sponsor row could not be saved (0 rows affected).' }, 500);
        }
        return jsonResponse({
          success: true,
          cheque: true,
          attendeeId: primary.id,
          total: computedTotal,
        });
      }

      // ─── PAYPAL: verify, then save sponsor + guest placeholders ───
      if (!paypalOrderId) return jsonResponse({ error: 'paypalOrderId required for PayPal sponsor payment' }, 400);

      const paypalMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
      const allAreTest = attendees.every((a: any) => a.is_test === true);
      const origin = (req.headers.get('origin') || '').toLowerCase();
      const isLocalhost = origin !== '' && (origin.includes('localhost') || origin.includes('127.0.0.1'));
      let useSandbox: boolean;
      if (isLocalhost) useSandbox = true;
      else if (paypalMode === 'production') useSandbox = false;
      else if (paypalMode === 'sandbox') useSandbox = true;
      else if (allAreTest) useSandbox = true;
      else useSandbox = false;
      const PAYPAL_CLIENT_ID = (useSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID')) : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
      const PAYPAL_CLIENT_SECRET = (useSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET')) : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
      const PAYPAL_API_BASE = Deno.env.get('PAYPAL_API_BASE') || (useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

      if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        return jsonResponse({ error: 'PayPal credentials not configured' }, 500);
      }

      const authResp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!authResp.ok) return jsonResponse({ error: 'PayPal auth failed' }, 502);
      const { access_token } = await authResp.json();

      const capResp = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      });
      const capData = await capResp.json();
      if (!capResp.ok || capData.status !== 'COMPLETED') {
        const issue = capData?.details?.[0]?.issue || capData?.name || capData?.message || 'unknown';
        const debugId = capData?.debug_id || '';
        console.error('[verify-payment sponsor] PayPal capture failed', JSON.stringify({ issue, debugId, useSandbox, apiBase: PAYPAL_API_BASE, clientIdTail: PAYPAL_CLIENT_ID.slice(-6), orderId: paypalOrderId }));
        return jsonResponse({ error: `PayPal capture failed: ${issue}${debugId ? ` (debug_id: ${debugId})` : ''}`, details: capData, diagnostic: { useSandbox, clientIdTail: PAYPAL_CLIENT_ID.slice(-6) } }, 502);
      }
      const capture = capData.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) return jsonResponse({ error: 'No capture data' }, 502);

      // ── Duplicate transaction protection (sponsor path) ──
      const { data: existingSponsorTx } = await supabase
        .from('attendees')
        .select('id')
        .eq('transaction_id', capture.id)
        .limit(1);
      if (existingSponsorTx && existingSponsorTx.length > 0) {
        return jsonResponse({ error: 'This payment has already been processed' }, 409);
      }

      const capturedAmount = parseFloat(capture.amount.value);
      if (Math.abs(capturedAmount - computedTotal) > 0.01) {
        return jsonResponse({ error: `Amount mismatch: expected ${computedTotal}, captured ${capturedAmount}` }, 422);
      }

      primary.payment_status = 'paid';
      primary.transaction_id = capture.id;
      primary.payment_amount = `${capturedAmount} ${capture.amount.currency_code}`;
      primary.user_id = authUserId;

      // Guest placeholder rows for tiers that include seats
      const seatCount =
        sponsorMeta.tier === 'signature' ? 16 :
        (sponsorMeta.tier === 'gold' || sponsorMeta.tier === 'silver') ? 8 : 0;
      const guestRows: any[] = [];
      for (let i = 1; i <= seatCount; i++) {
        const gid = crypto.randomUUID();
        guestRows.push({
          id: gid,
          form_id: primary.form_id,
          form_title: primary.form_title,
          name: `${primary.company_info?.orgName || primary.name} - Guest Ticket #${i}`,
          email: primary.email,
          ticket_type: `${sponsorMeta.tier} seat`,
          registered_at: new Date().toISOString(),
          qr_payload: JSON.stringify({ id: gid }),
          is_primary: false,
          primary_attendee_id: primary.id,
          payment_status: 'paid',
          transaction_id: capture.id,
          is_test: false,
          // Mark as pending-claim so the row routes through the group-flow
          // claim pipeline (PublicRegistration update-in-place, guest-claim-
          // completed email, "Pending/Completed" dashboard badge) and so the
          // fire-and-forget group-invite email below picks it up.
          guest_type: 'pending-claim',
        });
      }

      const { error } = await supabase.from('attendees').upsert([primary, ...guestRows]);
      if (error) {
        // CRITICAL: PayPal captured but DB insert failed. Log for manual recovery.
        console.error('CRITICAL: Sponsor PayPal captured but DB insert failed!', JSON.stringify({
          transactionId: capture.id,
          capturedAmount,
          capturedCurrency: capture.amount.currency_code,
          sponsorTier: sponsorMeta.tier,
          orgName: primary.company_info?.orgName,
          email: primary.email,
          dbError: error.message,
        }));
        return jsonResponse({
          error: `Your payment was processed but we encountered a database error saving your sponsorship. Please contact SCAGO with this reference: ${capture.id}`,
        }, 500);
      }

      return jsonResponse({
        success: true,
        sponsor: true,
        attendeeId: primary.id,
        transactionId: capture.id,
        guestCount: seatCount,
      });
    }
    // ── END SPONSOR BRANCH — fall through to existing event flow below ──

    // --- Initialize Supabase (service role — bypasses RLS) ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Compute expected price server-side ---
    let expectedAmount: number;
    let expectedCurrency: string;
    let maxAttendees: number | null = null;

    if (formId) {
      // ── SECURE PATH: look up form, compute price from DB ──
      const { data: formData, error: formError } = await supabase
        .from('forms')
        .select('fields, settings, form_type')
        .eq('id', formId)
        .single();

      if (formError || !formData) {
        return jsonResponse({ error: 'Form not found' }, 404);
      }

      // ── DYNAMIC PRICING BRANCH ──
      // Gated on form.settings.pricingTemplateId + request body pricingSelection.
      // Server re-resolves bracket, tier, category, and add-ons; rejects PayPal
      // captures that differ from the expected total by more than 1 cent.
      const pricingTemplateId = formData.settings?.pricingTemplateId ?? null;
      const pricingSelection = body.pricingSelection ?? null;

      // ── GROUP DYNAMIC PRICING BRANCH ──
      // Checked first because it has a distinct request shape (groupPricingSelections[]).
      // Single-person branch below handles the solo pricingSelection case.
      const groupPricingSelections = body.groupPricingSelections ?? null;

      if (pricingTemplateId && Array.isArray(groupPricingSelections) && groupPricingSelections.length >= 2) {
        // 1. Load template
        const { data: tpl, error: tplErr } = await supabase
          .from('pricing_templates').select('*').eq('id', pricingTemplateId).maybeSingle();
        if (tplErr || !tpl) return jsonResponse({ error: 'Pricing template not found' }, 400);

        // 2. Resolve active bracket (same logic as single-person branch)
        const nowMs = Date.now();
        let activeBracket: any = null;
        if (tpl.active_bracket_override) {
          activeBracket = (tpl.date_brackets ?? []).find((b: any) => b.id === tpl.active_bracket_override) ?? null;
        }
        if (!activeBracket) {
          for (const b of (tpl.date_brackets ?? [])) {
            const start = Date.parse(`${b.startDate}T00:00:00Z`);
            const end = Date.parse(`${b.endDate}T23:59:59.999Z`);
            if (nowMs >= start && nowMs <= end) { activeBracket = b; break; }
          }
        }
        if (!activeBracket) return jsonResponse({ error: 'No active pricing bracket' }, 400);

        const tiers = (tpl.tiers ?? []) as any[];
        if (tiers.length === 0) return jsonResponse({ error: 'No tiers configured' }, 400);

        // 3. Per-person resolution
        const memberResolutions: Array<{ cents: number; tierId: string; bracketId: string; categoryId: string }> = [];
        for (let i = 0; i < groupPricingSelections.length; i++) {
          const sel = groupPricingSelections[i];
          const code = (sel.countryCode ?? '').toUpperCase();
          const tier = tiers.find((t: any) => (t.countries ?? []).includes(code)) ?? tiers[tiers.length - 1];
          const cat = (tpl.categories ?? []).find((c: any) => c.id === sel.categoryId);
          if (!cat) return jsonResponse({ error: `Member ${i + 1}: unknown category '${sel.categoryId}'` }, 400);
          const fee = cat.prices?.[tier.id]?.[activeBracket.id];
          if (typeof fee !== 'number') return jsonResponse({ error: `Member ${i + 1}: price not configured` }, 400);
          const addonIds: string[] = Array.isArray(sel.addonIds) ? sel.addonIds : [];
          const addonTotal = addonIds.reduce((sum: number, id: string) => {
            const a = (tpl.addons ?? []).find((x: any) => x.id === id);
            return sum + (typeof a?.price === 'number' ? a.price : 0);
          }, 0);
          memberResolutions.push({ cents: fee + addonTotal, tierId: tier.id, bracketId: activeBracket.id, categoryId: cat.id });
        }

        const expectedCents = memberResolutions.reduce((sum, m) => sum + m.cents, 0);

        // 3b. BOGO pre-capture validation — runs BEFORE PayPal so we 422
        // cleanly without taking money on a malformed claim.
        const groupBogoClaims = Array.isArray(body.bogoClaims) ? body.bogoClaims : [];
        const groupBogoValidationFail = validateBogoClaimsPreCapture({
          bogoClaims: groupBogoClaims,
          memberCount: memberResolutions.length,
          formSettings: formData.settings,
          tpl,
          payerResolutionByIndex: memberResolutions.map(m => ({
            tierId: m.tierId, bracketId: m.bracketId, categoryId: m.categoryId,
          })),
        });
        if (groupBogoValidationFail) return groupBogoValidationFail;

        // 4. Capture PayPal order — replicate the inlined OAuth + capture logic
        if (!paypalOrderId) return jsonResponse({ error: 'paypalOrderId required for group payment' }, 400);
        const ppMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
        const allTest = attendees.every((a: any) => a.is_test === true);
        const ppOrigin = (req.headers.get('origin') || '').toLowerCase();
        const ppIsLocal = ppOrigin !== '' && (ppOrigin.includes('localhost') || ppOrigin.includes('127.0.0.1'));
        let ppSandbox: boolean;
        if (ppIsLocal) ppSandbox = true;
        else if (ppMode === 'production') ppSandbox = false;
        else if (ppMode === 'sandbox') ppSandbox = true;
        else if (allTest) ppSandbox = true;
        else ppSandbox = false;
        const PP_CLIENT_ID = (ppSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID')) : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
        const PP_CLIENT_SECRET = (ppSandbox ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET')) : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
        const PP_API_BASE = Deno.env.get('PAYPAL_API_BASE') || (ppSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
        if (!PP_CLIENT_ID || !PP_CLIENT_SECRET) return jsonResponse({ error: 'PayPal credentials not configured' }, 500);

        const ppAuthResp = await fetch(`${PP_API_BASE}/v1/oauth2/token`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${btoa(`${PP_CLIENT_ID}:${PP_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
        });
        if (!ppAuthResp.ok) return jsonResponse({ error: 'PayPal auth failed' }, 502);
        const { access_token: ppToken } = await ppAuthResp.json();

        const ppCapResp = await fetch(`${PP_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ppToken}`, 'Content-Type': 'application/json' },
        });
        const ppCapData = await ppCapResp.json();
        if (!ppCapResp.ok || ppCapData.status !== 'COMPLETED') {
          const issue = ppCapData?.details?.[0]?.issue || ppCapData?.name || ppCapData?.message || 'unknown';
          const debugId = ppCapData?.debug_id || '';
          console.error('[verify-payment] PayPal capture failed', JSON.stringify({ issue, debugId, useSandbox: ppSandbox, apiBase: PP_API_BASE, clientIdTail: PP_CLIENT_ID.slice(-6), orderId: paypalOrderId }));
          return jsonResponse({ error: `PayPal capture failed: ${issue}${debugId ? ` (debug_id: ${debugId})` : ''}`, details: ppCapData, diagnostic: { useSandbox: ppSandbox, clientIdTail: PP_CLIENT_ID.slice(-6) } }, 502);
        }
        const ppCapture = ppCapData.purchase_units?.[0]?.payments?.captures?.[0];
        if (!ppCapture) return jsonResponse({ error: 'No capture data in PayPal response' }, 502);
        const capturedCents = Math.round(Number(ppCapture.amount?.value ?? 0) * 100);

        if (Math.abs(capturedCents - expectedCents) > 1) {
          return jsonResponse({ error: 'Group price mismatch', expected: expectedCents, received: capturedCents }, 400);
        }

        // 5. Duplicate tx guard
        const { data: existingGroupTx } = await supabase.from('attendees').select('id').eq('transaction_id', ppCapture.id).limit(1);
        if (existingGroupTx && existingGroupTx.length > 0) return jsonResponse({ error: 'This payment has already been processed' }, 409);

        // 6. Persist N attendees
        const primaryId = attendees[0]?.id ?? crypto.randomUUID();
        const rows = memberResolutions.map((m, i) => {
          const attendeeDraft = attendees[i] ?? {};
          return {
            ...attendeeDraft,
            id: i === 0 ? primaryId : (attendeeDraft.id ?? crypto.randomUUID()),
            form_id: formId,
            is_primary: i === 0,
            primary_attendee_id: i === 0 ? null : primaryId,
            payment_status: 'paid',
            transaction_id: ppCapture.id,
            payment_amount: `${(m.cents / 100).toFixed(2)} ${tpl.currency ?? 'USD'}`,
            pricing_template_id: tpl.id,
            pricing_tier: m.tierId,
            pricing_bracket: m.bracketId,
            pricing_category_id: m.categoryId,
            // Primary submitter gets user_id stamped; pending-claim guests get null
            // (they'll claim via ?ref= link without auth — a future task can stamp
            // the claiming user's id at claim time)
            user_id: i === 0 ? authUserId : null,
          };
        });

        const { error: insertErr } = await supabase.from('attendees').upsert(rows);
        if (insertErr) {
          console.error('CRITICAL: group PayPal captured but DB insert failed', JSON.stringify({
            transactionId: ppCapture.id, expectedCents, capturedCents, rowCount: rows.length, dbError: insertErr.message,
          }));
          return jsonResponse({
            error: `Your payment was processed but we encountered a database error. Please contact the event organizer with this reference: ${ppCapture.id}`,
          }, 500);
        }

        // Fire-and-forget claim-link emails for pending-claim guests only.
        // Inline guests (purchaser already filled all their details) get their
        // actual ticket PDF from the client flow — sending a server email here
        // would duplicate. The client's SMTP integration runs post-verify and
        // handles inline-guest delivery with full branded PDFs.
        const pendingGuests = rows.filter((r: any) => r.id !== primaryId && r.guest_type === 'pending-claim');
        if (pendingGuests.length > 0) {
          const emailFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`;
          for (const g of pendingGuests) {
            fetch(emailFnUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ mode: 'group-invite', attendeeId: g.id, origin: req.headers.get('origin') ?? '' }),
            }).catch(e => console.warn('Group invite email failed', e));
          }
        }

        // BOGO post-insert: build free rows + fire emails. Partial failure
        // is tolerated (paid rows are already in); response surfaces
        // partialBogoFailure so client can prompt the user to retry from
        // their portal.
        const groupBogoResult = await processBogoClaims({
          supabase,
          paidRows: rows,
          bogoClaims: groupBogoClaims,
          invoiceId: ppCapture.id,
          formId,
          formSettings: formData.settings,
          formTitle: formData.title ?? null,
          serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          supabaseUrl: Deno.env.get('SUPABASE_URL')!,
          origin: req.headers.get('origin') ?? '',
        });

        return jsonResponse({
          ok: true,
          total: expectedCents,
          currency: tpl.currency ?? 'USD',
          primaryId,
          guestIds: rows.slice(1).map(r => r.id),
          partialBogoFailure: groupBogoResult.partialBogoFailure,
        });
      }
      // ── END GROUP DYNAMIC BRANCH — fall through to single-person dynamic branch below ──

      if (pricingTemplateId && pricingSelection) {
        // 1. Load pricing template
        const { data: tpl, error: tplErr } = await supabase
          .from('pricing_templates')
          .select('*')
          .eq('id', pricingTemplateId)
          .maybeSingle();

        if (tplErr || !tpl) return jsonResponse({ error: 'Pricing template not found' }, 400);

        // 2. Re-resolve active bracket server-side (never trust client)
        const nowMs = Date.now();
        let activeBracket: any = null;
        if (tpl.active_bracket_override) {
          activeBracket = (tpl.date_brackets ?? []).find((b: any) => b.id === tpl.active_bracket_override) ?? null;
        }
        if (!activeBracket) {
          for (const b of (tpl.date_brackets ?? [])) {
            const start = Date.parse(`${b.startDate}T00:00:00Z`);
            const end = Date.parse(`${b.endDate}T23:59:59.999Z`);
            if (nowMs >= start && nowMs <= end) { activeBracket = b; break; }
          }
        }
        if (!activeBracket) return jsonResponse({ error: 'No active pricing bracket' }, 400);

        // 3. Re-resolve tier from country code (fallback to last tier)
        const code = (pricingSelection.countryCode ?? '').toUpperCase();
        const tiers = (tpl.tiers ?? []) as any[];
        if (tiers.length === 0) return jsonResponse({ error: 'No tiers configured' }, 400);
        const activeTier = tiers.find((t: any) => (t.countries ?? []).includes(code)) ?? tiers[tiers.length - 1];

        // 4. Look up category
        const cat = (tpl.categories ?? []).find((c: any) => c.id === pricingSelection.categoryId);
        if (!cat) return jsonResponse({ error: 'Unknown category' }, 400);

        // 5. Look up base fee
        const fee = cat.prices?.[activeTier.id]?.[activeBracket.id];
        if (typeof fee !== 'number') return jsonResponse({ error: 'Price not configured' }, 400);

        // 6. Sum add-on prices (ignore unknown IDs)
        const addonIds: string[] = Array.isArray(pricingSelection.addonIds) ? pricingSelection.addonIds : [];
        const addonTotal = addonIds.reduce((sum: number, id: string) => {
          const a = (tpl.addons ?? []).find((x: any) => x.id === id);
          return sum + (typeof a?.price === 'number' ? a.price : 0);
        }, 0);

        // 7. expectedCents = base fee (already in cents) + addons
        const expectedCents = fee + addonTotal;

        // 7b. BOGO pre-capture validation — solo branch has exactly 1 paid
        // attendee, so any bogoClaim must have paidIndex=0.
        const soloBogoClaims = Array.isArray(body.bogoClaims) ? body.bogoClaims : [];
        const soloBogoValidationFail = validateBogoClaimsPreCapture({
          bogoClaims: soloBogoClaims,
          memberCount: 1,
          formSettings: formData.settings,
          tpl,
          payerResolutionByIndex: [{
            tierId: activeTier.id, bracketId: activeBracket.id, categoryId: cat.id,
          }],
        });
        if (soloBogoValidationFail) return soloBogoValidationFail;

        // 8. Capture PayPal order and extract amount in cents
        if (!paypalOrderId) return jsonResponse({ error: 'paypalOrderId required for dynamic pricing payment' }, 400);

        const ppMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
        const allTest = attendees.every((a: any) => a.is_test === true);
        const ppOrigin = (req.headers.get('origin') || '').toLowerCase();
        const ppIsLocal = ppOrigin !== '' && (ppOrigin.includes('localhost') || ppOrigin.includes('127.0.0.1'));
        let ppSandbox: boolean;
        if (ppIsLocal) ppSandbox = true;
        else if (ppMode === 'production') ppSandbox = false;
        else if (ppMode === 'sandbox') ppSandbox = true;
        else if (allTest) ppSandbox = true;
        else ppSandbox = false;

        const PP_CLIENT_ID = (
          ppSandbox
            ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID'))
            : Deno.env.get('PAYPAL_CLIENT_ID')
        )?.trim() || '';
        const PP_CLIENT_SECRET = (
          ppSandbox
            ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET'))
            : Deno.env.get('PAYPAL_CLIENT_SECRET')
        )?.trim() || '';
        const PP_API_BASE = Deno.env.get('PAYPAL_API_BASE')
          || (ppSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

        if (!PP_CLIENT_ID || !PP_CLIENT_SECRET) {
          return jsonResponse({ error: 'PayPal credentials not configured' }, 500);
        }

        const ppAuthResp = await fetch(`${PP_API_BASE}/v1/oauth2/token`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${PP_CLIENT_ID}:${PP_CLIENT_SECRET}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (!ppAuthResp.ok) return jsonResponse({ error: 'PayPal auth failed' }, 502);
        const { access_token: ppToken } = await ppAuthResp.json();

        const ppCapResp = await fetch(`${PP_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ppToken}`, 'Content-Type': 'application/json' },
        });
        const ppCapData = await ppCapResp.json();
        if (!ppCapResp.ok || ppCapData.status !== 'COMPLETED') {
          const issue = ppCapData?.details?.[0]?.issue || ppCapData?.name || ppCapData?.message || 'unknown';
          const debugId = ppCapData?.debug_id || '';
          console.error('[verify-payment dyn-single] PayPal capture failed', JSON.stringify({ issue, debugId, useSandbox: ppSandbox, apiBase: PP_API_BASE, clientIdTail: PP_CLIENT_ID.slice(-6), orderId: paypalOrderId }));
          return jsonResponse({ error: `PayPal capture failed: ${issue}${debugId ? ` (debug_id: ${debugId})` : ''}`, details: ppCapData, diagnostic: { useSandbox: ppSandbox, clientIdTail: PP_CLIENT_ID.slice(-6) } }, 502);
        }
        const ppCapture = ppCapData.purchase_units?.[0]?.payments?.captures?.[0];
        if (!ppCapture) return jsonResponse({ error: 'No capture data in PayPal response' }, 502);

        const capturedCents = Math.round(Number(ppCapture.amount?.value ?? 0) * 100);

        // 9. Reject if captured amount differs from expected by > 1 cent
        if (Math.abs(capturedCents - expectedCents) > 1) {
          return jsonResponse({
            error: 'Price mismatch',
            expected: expectedCents,
            received: capturedCents,
          }, 400);
        }

        // Duplicate transaction protection
        const { data: existingDynTx } = await supabase
          .from('attendees')
          .select('id')
          .eq('transaction_id', ppCapture.id)
          .limit(1);
        if (existingDynTx && existingDynTx.length > 0) {
          return jsonResponse({ error: 'This payment has already been processed' }, 409);
        }

        // 10. Persist attendee with pricing metadata
        const primary = attendees[0] ?? {};
        const { error: insertErr } = await supabase.from('attendees').upsert([{
          ...primary,
          payment_status: 'paid',
          transaction_id: ppCapture.id,
          payment_amount: `${(expectedCents / 100).toFixed(2)} ${tpl.currency ?? 'CAD'}`,
          pricing_template_id: tpl.id,
          pricing_bracket: activeBracket.id,
          pricing_tier: activeTier.id,
          pricing_category_id: cat.id,
          user_id: authUserId,
        }]);
        if (insertErr) {
          console.error('CRITICAL: Dynamic pricing PayPal captured but DB insert failed!', JSON.stringify({
            transactionId: ppCapture.id,
            capturedCents,
            expectedCents,
            pricingTemplateId: tpl.id,
            email: primary.email,
            dbError: insertErr.message,
          }));
          return jsonResponse({
            error: `Your payment was processed but we encountered a database error. Please contact the event organizer with this reference: ${ppCapture.id}`,
          }, 500);
        }

        // 11. BOGO post-insert: build + insert free rows, fire emails.
        const soloPaidRowForBogo = {
          id: primary.id,
          form_id: formId,
          form_title: formData.title ?? null,
          email: primary.email,
          pricing_template_id: tpl.id,
          pricing_tier: activeTier.id,
          pricing_bracket: activeBracket.id,
        };
        const soloBogoResult = await processBogoClaims({
          supabase,
          paidRows: [soloPaidRowForBogo],
          bogoClaims: soloBogoClaims,
          invoiceId: ppCapture.id,
          formId,
          formSettings: formData.settings,
          formTitle: formData.title ?? null,
          serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          supabaseUrl: Deno.env.get('SUPABASE_URL')!,
          origin: req.headers.get('origin') ?? '',
        });

        // 12. Return success
        return jsonResponse({
          ok: true,
          total: expectedCents,
          currency: tpl.currency ?? 'CAD',
          partialBogoFailure: soloBogoResult.partialBogoFailure,
        });
      }
      // ── END DYNAMIC PRICING BRANCH — fall through to static-pricing event branch ──

      // Guard: if the form is configured for dynamic pricing but the request
      // supplied no pricingSelection (and no groupPricingSelections), reject
      // hard rather than silently computing $0 via the static branch and
      // allowing a free registration on a paid-only event.
      if (pricingTemplateId) {
        return jsonResponse({
          error: 'This form requires a pricing selection to determine the registration fee.',
        }, 400);
      }

      const fields: FormField[] = typeof formData.fields === 'string'
        ? JSON.parse(formData.fields)
        : formData.fields;

      const ticketField = fields.find((f: FormField) => f.type === 'ticket');

      if (!ticketField?.ticketConfig) {
        // No ticket config → genuinely free form
        expectedAmount = 0;
        expectedCurrency = 'USD';
      } else {
        const config = ticketField.ticketConfig;
        let subtotal = 0;
        let totalSeats = 0;

        for (const item of config.items) {
          const qty = (ticketQuantities && ticketQuantities[item.id]) || 0;

          if (qty < 0 || !Number.isInteger(qty)) {
            return jsonResponse({ error: `Invalid quantity for "${item.name}"` }, 400);
          }
          if (qty > item.maxPerOrder) {
            return jsonResponse({ error: `Quantity for "${item.name}" exceeds maximum of ${item.maxPerOrder}` }, 400);
          }

          subtotal += item.price * qty;
          totalSeats += qty * (item.seats || 1);
        }

        // ── Inventory check ──
        // Fetch all primary, non-test attendees for this form and parse sold quantities
        const { data: existingAttendees } = await supabase
          .from('attendees')
          .select('ticket_type')
          .eq('form_id', formId)
          .eq('is_primary', true)
          .eq('is_test', false);

        if (existingAttendees) {
          const soldCounts: Record<string, number> = {};
          for (const a of existingAttendees) {
            if (!a.ticket_type) continue;
            const parts = a.ticket_type.split(', ');
            for (const part of parts) {
              const match = part.match(/^(.+?)\s*x(\d+)$/);
              if (match) {
                const name = match[1].trim();
                const qty = parseInt(match[2], 10);
                soldCounts[name] = (soldCounts[name] || 0) + qty;
              }
            }
          }

          for (const item of config.items) {
            if (item.inventory > 0) {
              const requestedQty = (ticketQuantities && ticketQuantities[item.id]) || 0;
              const sold = soldCounts[item.name] || 0;
              const remaining = item.inventory - sold;
              if (requestedQty > remaining) {
                return jsonResponse({ error: `"${item.name}" has only ${Math.max(0, remaining)} tickets remaining` }, 409);
              }
            }
          }
        }

        // Apply promo code server-side
        if (promoCode && config.promoCodes) {
          const promo = config.promoCodes.find(
            (p: PromoCode) => p.code.toLowerCase() === promoCode.toLowerCase()
          );
          if (promo) {
            const discount = promo.type === 'percent'
              ? subtotal * (promo.value / 100)
              : promo.value;
            subtotal = Math.max(0, subtotal - discount);
          }
        }

        expectedAmount = subtotal;
        expectedCurrency = config.currency || 'USD';

        // Validate attendee count against ticket quantities
        const donatedSeats = Math.max(0, Math.min(clientDonatedSeats || 0, totalSeats - 1));
        maxAttendees = Math.max(1, totalSeats - donatedSeats);
      }
    } else {
      // ── LEGACY PATH: client-provided values (backward compat) ──
      expectedAmount = legacyExpectedAmount ?? 0;
      expectedCurrency = legacyExpectedCurrency || 'USD';
    }

    // Validate attendee count
    if (maxAttendees !== null && attendees.length > maxAttendees) {
      return jsonResponse({ error: `Too many attendees: expected at most ${maxAttendees}, received ${attendees.length}` }, 400);
    }

    // --- Determine mode ---
    const mode = clientMode || (paypalOrderId ? 'paid' : 'free');

    // ════════════════════════════════════════════
    //  FREE REGISTRATION
    // ════════════════════════════════════════════
    if (mode === 'free') {
      if (expectedAmount > 0) {
        return jsonResponse({ error: 'This registration requires payment. Cannot register as free.' }, 400);
      }

      const stampedAttendees = attendees.map((a: any, i: number) => ({
        ...a,
        payment_status: 'free',
        // Primary submitter (index 0) gets user_id; guest placeholder rows get null
        user_id: i === 0 ? authUserId : null,
      }));

      const { error: insertError } = await supabase
        .from('attendees')
        .upsert(stampedAttendees);

      if (insertError) {
        console.error('Failed to save attendees:', insertError);
        return jsonResponse({ error: `Database error: ${insertError.message}` }, 500);
      }

      return jsonResponse({
        success: true,
        transactionId: null,
        amount: `0 ${expectedCurrency}`,
        attendeeCount: stampedAttendees.length,
      });
    }

    // ════════════════════════════════════════════
    //  PAID REGISTRATION — PayPal verification
    // ════════════════════════════════════════════
    if (!paypalOrderId) {
      return jsonResponse({ error: 'Missing required field: paypalOrderId for paid registration' }, 400);
    }

    // Determine PayPal environment — localhost is ALWAYS sandbox (safety), then PAYPAL_MODE, then test-mode, then Origin auto-detect
    const paypalMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
    const allAreTest = attendees.every((a: any) => a.is_test === true);
    const originHeader = (req.headers.get('origin') || '').toLowerCase();
    const isLocalhost = originHeader !== '' && (originHeader.includes('localhost') || originHeader.includes('127.0.0.1'));
    let useSandbox: boolean;
    if (isLocalhost) {
      // Dev machines run the client with sandbox PayPal credentials; forcing production
      // here would try to capture a sandbox order against production API and 502.
      useSandbox = true;
    } else if (paypalMode === 'production') {
      useSandbox = false;
    } else if (paypalMode === 'sandbox') {
      useSandbox = true;
    } else if (allAreTest) {
      // FormPreview / admin test submissions always use sandbox (test records are worthless to attackers)
      useSandbox = true;
    } else {
      // Auto-detect from Origin header — default to PRODUCTION if origin is missing or unknown.
      // Privacy browsers/extensions can strip Origin headers, so missing origin must NOT
      // fall back to sandbox (which would break real payments).
      useSandbox = false;
    }

    console.log(`[verify-payment] mode=${mode}, useSandbox=${useSandbox}, origin=${(req.headers.get('origin') || '').toLowerCase()}, formId=${formId || 'legacy'}, attendees=${attendees.length}`);

    const PAYPAL_CLIENT_ID = (
      useSandbox
        ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID'))
        : Deno.env.get('PAYPAL_CLIENT_ID')
    )?.trim() || '';

    const PAYPAL_CLIENT_SECRET = (
      useSandbox
        ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET'))
        : Deno.env.get('PAYPAL_CLIENT_SECRET')
    )?.trim() || '';

    const PAYPAL_API_BASE = Deno.env.get('PAYPAL_API_BASE')
      || (useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return jsonResponse({ error: 'PayPal credentials not configured on server' }, 500);
    }

    // Get PayPal access token
    const authResponse = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!authResponse.ok) {
      const authError = await authResponse.text();
      console.error('PayPal auth failed:', authError);
      return jsonResponse({ error: 'Failed to authenticate with PayPal API' }, 502);
    }

    const { access_token } = await authResponse.json();

    // Capture the order (this charges the user)
    const captureResponse = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok || captureData.status !== 'COMPLETED') {
      const issue = captureData?.details?.[0]?.issue || captureData?.name || captureData?.message || 'unknown';
      const debugId = captureData?.debug_id || '';
      console.error('[verify-payment static] PayPal capture failed', JSON.stringify({ issue, debugId, useSandbox, apiBase: PAYPAL_API_BASE, clientIdTail: PAYPAL_CLIENT_ID.slice(-6), orderId: paypalOrderId }));
      return jsonResponse({
        error: `PayPal capture failed: ${issue}${debugId ? ` (debug_id: ${debugId})` : ''}`,
        details: captureData,
        diagnostic: { useSandbox, clientIdTail: PAYPAL_CLIENT_ID.slice(-6) },
      }, 502);
    }

    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) {
      return jsonResponse({ error: 'No capture data found in PayPal response' }, 502);
    }

    const transactionId = capture.id;
    const capturedAmount = parseFloat(capture.amount.value);
    const capturedCurrency = capture.amount.currency_code;

    // ALWAYS validate amount — no more falsy bypass
    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      console.error(`Amount mismatch: expected ${expectedAmount}, captured ${capturedAmount}`);
      return jsonResponse({
        error: `Payment amount mismatch. Expected: ${expectedAmount}, Captured: ${capturedAmount}`,
      }, 422);
    }

    // ALWAYS validate currency
    if (capturedCurrency !== expectedCurrency) {
      console.error(`Currency mismatch: expected ${expectedCurrency}, captured ${capturedCurrency}`);
      return jsonResponse({
        error: `Payment currency mismatch. Expected: ${expectedCurrency}, Captured: ${capturedCurrency}`,
      }, 422);
    }

    // ── Duplicate transaction protection ──
    const { data: existingTx } = await supabase
      .from('attendees')
      .select('id')
      .eq('transaction_id', transactionId)
      .limit(1);

    if (existingTx && existingTx.length > 0) {
      return jsonResponse({ error: 'This payment has already been processed' }, 409);
    }

    // --- Save attendees with verified payment info ---
    const stampedAttendees = attendees.map((a: any, i: number) => ({
      ...a,
      payment_status: 'paid',
      transaction_id: transactionId,
      payment_amount: `${capturedAmount} ${capturedCurrency}`,
      // Primary submitter (index 0) gets user_id; guest placeholder rows get null
      user_id: i === 0 ? authUserId : null,
    }));

    const { error: insertError } = await supabase
      .from('attendees')
      .upsert(stampedAttendees);

    if (insertError) {
      // CRITICAL: Payment was captured but attendees failed to save.
      // Log full details for manual recovery.
      console.error('CRITICAL: Payment captured but DB insert failed!', JSON.stringify({
        transactionId,
        capturedAmount,
        capturedCurrency,
        formId: formId || 'legacy',
        attendeeCount: stampedAttendees.length,
        primaryName: stampedAttendees[0]?.name,
        primaryEmail: stampedAttendees[0]?.email,
        dbError: insertError.message,
      }));
      return jsonResponse({
        error: `Your payment was processed but we encountered a database error saving your registration. Please contact the event organizer with this reference: ${transactionId}`,
      }, 500);
    }

    return jsonResponse({
      success: true,
      transactionId,
      amount: `${capturedAmount} ${capturedCurrency}`,
      attendeeCount: stampedAttendees.length,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('verify-payment error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
