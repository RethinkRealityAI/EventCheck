// Standalone balance collection for pending-payment registrations.
//
// A registrant whose row is payment_status='pending' opens /#/pay?token=… and
// sees ONE thing: the amount and a PayPal button. No form, no login, no
// re-registration. On capture, ONLY the payment columns change — the
// registration itself (answers, ticket type, QR) is never touched.
//
// Security model mirrors registration-download: the HMAC token IS the
// credential (verify_jwt=false in config.toml), and the AMOUNT comes from the
// attendee row on the server — the client's order total is verified against it
// after capture, never trusted. The payability rules live in
// _shared/payBalance.ts and are unit-tested.
//
// Native Deno.serve per the repo rule (the std/http import flakes the bundler).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyPayToken } from '../_shared/registrationToken.ts';
import { assessPayability, captureSettles, payabilityMessage, parsePaymentAmount } from '../_shared/payBalance.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = String(body?.action ?? '');
    const token = String(body?.token ?? '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const v = await verifyPayToken(token, serviceKey, Date.now());
    if (!v.valid) return json({ error: 'invalid-token', reason: v.reason }, 400);

    const { data: row } = await supabase
      .from('attendees').select('*').eq('id', v.attendeeId).maybeSingle();

    const payability = assessPayability(row);

    if (action === 'resolve') {
      // Allow-listed summary only — enough to render "you owe $X for <event>",
      // never the answers blob (it holds phone numbers and emergency contacts).
      let eventTitle = 'the event';
      if (row?.form_id) {
        const { data: form } = await supabase
          .from('forms').select('title').eq('id', row.form_id).maybeSingle();
        if (form?.title) eventTitle = form.title;
      }
      if (!payability.ok) {
        return json({
          status: payability.reason,
          message: payabilityMessage(payability.reason),
          eventTitle,
          name: row?.name ?? null,
        });
      }
      return json({
        status: 'payable',
        eventTitle,
        name: row?.name ?? null,
        ticketType: row?.ticket_type ?? null,
        amountCents: payability.cents,
        currency: payability.currency,
      });
    }

    if (action === 'capture') {
      if (!payability.ok) {
        // Includes 'already-paid' — the idempotency guard for a re-opened link.
        return json({ error: payabilityMessage(payability.reason), status: payability.reason }, 409);
      }
      const orderId = String(body?.paypalOrderId ?? '');
      if (!orderId) return json({ error: 'paypalOrderId required' }, 400);

      // Same mode resolution as verify-payment, minus its test-row heuristics:
      // a balance link always charges real money unless the project is
      // explicitly in sandbox.
      const useSandbox = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase() === 'sandbox';
      const PP_CLIENT_ID = (useSandbox
        ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID'))
        : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
      const PP_CLIENT_SECRET = (useSandbox
        ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET'))
        : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
      const PP_API_BASE = Deno.env.get('PAYPAL_API_BASE')
        || (useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
      if (!PP_CLIENT_ID || !PP_CLIENT_SECRET) {
        return json({ error: 'PayPal credentials not configured on server' }, 500);
      }

      const authResp = await fetch(`${PP_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${PP_CLIENT_ID}:${PP_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!authResp.ok) return json({ error: 'Failed to authenticate with PayPal API' }, 502);
      const { access_token } = await authResp.json();

      const capResp = await fetch(`${PP_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      });
      const capData = await capResp.json();
      if (!capResp.ok || capData.status !== 'COMPLETED') {
        const issue = capData?.details?.[0]?.issue || capData?.name || 'unknown';
        const debugId = capData?.debug_id || '';
        // Same durable trail as checkout failures — an admin diagnoses from
        // payment_failures, never from edge logs (unreachable on GANSID).
        await supabase.from('payment_failures').insert({
          provider: 'paypal',
          stage: 'pay-balance-capture-failed',
          form_id: row?.form_id ?? null,
          order_ref: orderId,
          amount: row?.payment_amount ?? null,
          message: `Payment-link capture failed: ${issue}${debugId ? ` (debug_id: ${debugId})` : ''}`,
          email: row?.email ?? null,
          attendee_name: row?.name ?? null,
        }).then(() => {}, () => {});
        return json({ error: `PayPal could not complete the payment: ${issue}` }, 502);
      }

      const capture = capData.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture) return json({ error: 'No capture data in PayPal response' }, 502);
      const captured = {
        amountMajorUnits: parseFloat(capture.amount.value),
        currency: String(capture.amount.currency_code ?? ''),
      };
      const expected = parsePaymentAmount(row!.payment_amount)!;
      if (!captureSettles(expected, captured)) {
        // Money moved but does NOT settle the balance (wrong amount/currency).
        // Record it loudly — this needs a human, not a silent success.
        await supabase.from('payment_failures').insert({
          provider: 'paypal',
          stage: 'pay-balance-amount-mismatch',
          form_id: row?.form_id ?? null,
          order_ref: orderId,
          amount: `captured ${captured.amountMajorUnits} ${captured.currency}, expected ${expected.cents / 100} ${expected.currency}`,
          message: `Capture ${capture.id} does not settle the balance — needs manual review/refund.`,
          email: row?.email ?? null,
          attendee_name: row?.name ?? null,
        }).then(() => {}, () => {});
        return json({
          error: 'Your payment went through but did not match the expected amount. The organizers have been notified and will follow up — you will not lose the money.',
        }, 409);
      }

      // Flip ONLY the payment columns, and only while still pending — the
      // status guard is the last line against a double-capture race, and the
      // rowcount check (standing rule) is how we know the guard held.
      const { data: updated } = await supabase
        .from('attendees')
        .update({
          payment_status: 'paid',
          payment_method: 'paypal',
          transaction_id: capture.id,
          admin_notes: `${row!.admin_notes ? row!.admin_notes + '\n' : ''}Payment collected via payment link: ${capture.id} (${captured.amountMajorUnits} ${captured.currency}).`,
        })
        .eq('id', v.attendeeId)
        .eq('payment_status', 'pending')
        .select('id');
      if (!updated || updated.length === 0) {
        // Captured but the row was no longer pending — flag for reconciliation.
        await supabase.from('payment_failures').insert({
          provider: 'paypal',
          stage: 'pay-balance-row-not-updated',
          order_ref: orderId,
          message: `Capture ${capture.id} succeeded but attendee ${v.attendeeId} was not in 'pending' — possible double payment, review for refund.`,
          email: row?.email ?? null,
          attendee_name: row?.name ?? null,
        }).then(() => {}, () => {});
        return json({
          error: 'This balance appears to have been settled already. The organizers have been notified — if you were charged twice, you will be refunded.',
        }, 409);
      }

      return json({ ok: true, transactionId: capture.id });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[pay-balance]', String(e));
    return json({ error: 'Unexpected error' }, 500);
  }
});
