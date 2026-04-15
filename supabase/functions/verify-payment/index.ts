// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    if (!attendees || attendees.length === 0) {
      return jsonResponse({ error: 'Missing required field: attendees' }, 400);
    }

    // ── SPONSOR BRANCH: special handling before the standard event flow ──
    if (sponsorMeta) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const primary = attendees[0];
      primary.sponsor_tier = sponsorMeta.tier || null;
      primary.sponsor_items = sponsorMeta.items || [];
      primary.company_info = sponsorMeta.companyInfo || {};
      primary.sponsored_awards = sponsorMeta.sponsoredAwards || [];
      primary.payment_method = paymentMethod === 'cheque' ? 'cheque' : 'paypal';

      const computedTotal = Number(sponsorMeta.total || 0);
      const currency = 'CAD';

      // ─── CHEQUE: skip PayPal, save pending, no guest tickets yet ───
      if (paymentMethod === 'cheque') {
        primary.payment_status = 'pending';
        primary.payment_amount = `${computedTotal.toFixed(2)} ${currency} (PENDING CHEQUE)`;
        const { error } = await supabase.from('attendees').upsert([primary]);
        if (error) return jsonResponse({ error: error.message }, 500);
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
      let useSandbox: boolean;
      if (paypalMode === 'production') useSandbox = false;
      else if (paypalMode === 'sandbox') useSandbox = true;
      else if (allAreTest) useSandbox = true;
      else {
        const origin = (req.headers.get('origin') || '').toLowerCase();
        useSandbox = origin !== '' && (origin.includes('localhost') || origin.includes('127.0.0.1'));
      }
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
        return jsonResponse({ error: 'PayPal capture failed', details: capData }, 502);
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
        .select('fields')
        .eq('id', formId)
        .single();

      if (formError || !formData) {
        return jsonResponse({ error: 'Form not found' }, 404);
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

      const stampedAttendees = attendees.map((a: any) => ({
        ...a,
        payment_status: 'free',
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

    // Determine PayPal environment — PAYPAL_MODE overrides, then test-mode check, then Origin auto-detect
    const paypalMode = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase();
    const allAreTest = attendees.every((a: any) => a.is_test === true);
    let useSandbox: boolean;
    if (paypalMode === 'production') {
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
      const origin = (req.headers.get('origin') || '').toLowerCase();
      useSandbox = origin !== '' && (origin.includes('localhost') || origin.includes('127.0.0.1'));
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
      console.error('PayPal capture not completed or failed:', captureData);
      return jsonResponse({
        error: 'Payment was not completed or PayPal API rejected the request',
        details: captureData.status || captureData.error_description || captureData.message || 'Unknown error',
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
    const stampedAttendees = attendees.map((a: any) => ({
      ...a,
      payment_status: 'paid',
      transaction_id: transactionId,
      payment_amount: `${capturedAmount} ${capturedCurrency}`,
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
