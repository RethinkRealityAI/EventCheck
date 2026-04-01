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
      // Legacy parameters (backward compat only — used when formId is absent)
      expectedAmount: legacyExpectedAmount,
      expectedCurrency: legacyExpectedCurrency,
    } = body;

    if (!attendees || attendees.length === 0) {
      return jsonResponse({ error: 'Missing required field: attendees' });
    }

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
        return jsonResponse({ error: 'Form not found' });
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
            return jsonResponse({ error: `Invalid quantity for "${item.name}"` });
          }
          if (qty > item.maxPerOrder) {
            return jsonResponse({ error: `Quantity for "${item.name}" exceeds maximum of ${item.maxPerOrder}` });
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
                return jsonResponse({ error: `"${item.name}" has only ${Math.max(0, remaining)} tickets remaining` });
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
      return jsonResponse({ error: `Too many attendees: expected at most ${maxAttendees}, received ${attendees.length}` });
    }

    // --- Determine mode ---
    const mode = clientMode || (paypalOrderId ? 'paid' : 'free');

    // ════════════════════════════════════════════
    //  FREE REGISTRATION
    // ════════════════════════════════════════════
    if (mode === 'free') {
      if (expectedAmount > 0) {
        return jsonResponse({ error: 'This registration requires payment. Cannot register as free.' });
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
        return jsonResponse({ error: `Database error: ${insertError.message}` });
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
      return jsonResponse({ error: 'Missing required field: paypalOrderId for paid registration' });
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
      // Auto-detect: browser sets Origin header automatically (not spoofable in browser requests)
      const origin = (req.headers.get('origin') || '').toLowerCase();
      useSandbox = origin.includes('localhost') || origin.includes('127.0.0.1') || origin === '';
    }

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
      return jsonResponse({ error: 'PayPal credentials not configured on server' });
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
      return jsonResponse({ error: 'Failed to authenticate with PayPal API' });
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
      });
    }

    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) {
      return jsonResponse({ error: 'No capture data found in PayPal response' });
    }

    const transactionId = capture.id;
    const capturedAmount = parseFloat(capture.amount.value);
    const capturedCurrency = capture.amount.currency_code;

    // ALWAYS validate amount — no more falsy bypass
    if (Math.abs(capturedAmount - expectedAmount) > 0.01) {
      console.error(`Amount mismatch: expected ${expectedAmount}, captured ${capturedAmount}`);
      return jsonResponse({
        error: `Payment amount mismatch. Expected: ${expectedAmount}, Captured: ${capturedAmount}`,
      });
    }

    // ALWAYS validate currency
    if (capturedCurrency !== expectedCurrency) {
      console.error(`Currency mismatch: expected ${expectedCurrency}, captured ${capturedCurrency}`);
      return jsonResponse({
        error: `Payment currency mismatch. Expected: ${expectedCurrency}, Captured: ${capturedCurrency}`,
      });
    }

    // ── Duplicate transaction protection ──
    const { data: existingTx } = await supabase
      .from('attendees')
      .select('id')
      .eq('transaction_id', transactionId)
      .limit(1);

    if (existingTx && existingTx.length > 0) {
      return jsonResponse({ error: 'This payment has already been processed' });
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
      console.error('Failed to save attendees:', insertError);
      return jsonResponse({ error: `Database error: ${insertError.message}` });
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
    return jsonResponse({ error: message });
  }
});
