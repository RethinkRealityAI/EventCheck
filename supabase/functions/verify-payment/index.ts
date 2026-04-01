// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

interface AttendeeRecord {
  id: string;
  form_id: string;
  form_title?: string;
  name: string;
  email: string;
  ticket_type: string;
  registered_at: string;
  qr_payload: string;
  payment_status: string;
  payment_amount?: string;
  transaction_id?: string;
  invoice_id?: string;
  answers?: any;
  is_test?: boolean;
  is_primary?: boolean;
  primary_attendee_id?: string;
  dietary_preferences?: string;
  guest_type?: string;
  donation_amount?: number;
  donation_details?: any;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { paypalOrderId, attendees, expectedAmount, expectedCurrency } = await req.json();

    if (!paypalOrderId || !attendees || attendees.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: paypalOrderId, attendees' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Step 1: Verify payment with PayPal ---
    const PAYPAL_CLIENT_ID = (Deno.env.get('PAYPAL_CLIENT_ID') || '').trim();
    const PAYPAL_CLIENT_SECRET = (Deno.env.get('PAYPAL_CLIENT_SECRET') || '').trim();
    
    // Default to the live production API to prevent sandbox mismatch errors in production.
    const PAYPAL_API_BASE = Deno.env.get('PAYPAL_API_BASE') || 'https://api-m.paypal.com';

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: 'PayPal credentials not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with PayPal' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { access_token } = await authResponse.json();

    // Capture the order (this actually charges the user)
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
      return new Response(
        JSON.stringify({ 
          error: 'Payment was not completed or PayPal API rejected the request', 
          details: captureData.status || captureData.error_description || captureData.message || 'Unknown error' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract transaction details from the capture
    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) {
      return new Response(
        JSON.stringify({ error: 'No capture data found in PayPal response' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transactionId = capture.id;
    const capturedAmount = parseFloat(capture.amount.value);
    const capturedCurrency = capture.amount.currency_code;

    // Verify the amount matches what we expected
    if (expectedAmount && Math.abs(capturedAmount - expectedAmount) > 0.01) {
      console.error(`Amount mismatch: expected ${expectedAmount}, got ${capturedAmount}`);
      return new Response(
        JSON.stringify({ error: 'Payment amount does not match expected amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Securely verify identical currency_code to prevent bypass exploitation
    if (expectedCurrency && capturedCurrency !== expectedCurrency) {
      console.error(`Currency mismatch: expected ${expectedCurrency}, got ${capturedCurrency}`);
      return new Response(
        JSON.stringify({ error: 'Payment currency does not match expected currency' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Step 2: Save attendees in a transaction ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Stamp all attendees with the verified payment info
    const stampedAttendees = attendees.map((a: AttendeeRecord) => ({
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
      return new Response(
        JSON.stringify({ error: `Database error: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        transactionId,
        amount: `${capturedAmount} ${capturedCurrency}`,
        attendeeCount: stampedAttendees.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('verify-payment error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
