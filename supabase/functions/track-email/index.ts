// Email open/click tracking endpoint.
//
// GET /track-email?id=<tracking_id>&type=open
//   - Updates email_sends.opened_at (first open only) for the row with tracking_id
//   - Returns a 1x1 transparent GIF
//
// GET /track-email?id=<tracking_id>&type=click&to=<url>
//   - Bumps email_sends.click_count and sets last_clicked_at
//   - 302 redirects to `to`
//
// Called from email clients with no auth. Uses service-role internally to
// bypass RLS on email_sends (table is admin-read-only otherwise).
//
// Safe to fail silently — email UX must never break over analytics errors.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TRANSPARENT_GIF = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function gifResponse(): Response {
  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  });
}

function redirectResponse(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...CORS_HEADERS, Location: to },
  });
}

function isSafeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const trackingId = url.searchParams.get('id') || '';
  const type = url.searchParams.get('type') || 'open';
  const to = url.searchParams.get('to') || '';

  // Fall back to a safe no-op response if the request is malformed — never
  // break the email for the recipient.
  if (!trackingId) {
    return type === 'click' && isSafeUrl(to) ? redirectResponse(to) : gifResponse();
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceKey) {
    return type === 'click' && isSafeUrl(to) ? redirectResponse(to) : gifResponse();
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (type === 'click') {
      // Read current row, bump count, write back. Small race on click_count
      // is acceptable — this is analytics, not billing.
      const { data: row } = await supabase
        .from('email_sends')
        .select('click_count')
        .eq('tracking_id', trackingId)
        .maybeSingle();

      if (row) {
        await supabase
          .from('email_sends')
          .update({
            click_count: (row.click_count ?? 0) + 1,
            last_clicked_at: new Date().toISOString(),
          })
          .eq('tracking_id', trackingId);
      }
    } else {
      // Only stamp opened_at the first time — keeps "first opened at" stable.
      await supabase
        .from('email_sends')
        .update({ opened_at: new Date().toISOString() })
        .eq('tracking_id', trackingId)
        .is('opened_at', null);
    }
  } catch {
    // Swallow — analytics must never break the email experience.
  }

  return type === 'click' && isSafeUrl(to) ? redirectResponse(to) : gifResponse();
});
