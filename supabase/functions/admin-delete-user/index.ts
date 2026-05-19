// supabase/functions/admin-delete-user/index.ts
//
// Super-admin-only. Deletes an auth.users row by id; the profiles row cascades
// via FK. Used from the Signups dashboard tab so admins can remove test or
// abandoned signups end-to-end (the prior tab only had email actions and left
// the auth user behind, which then blocked re-signup with the same email).
//
// Attendee rows that reference user_id are NOT deleted — they're paid event
// data and survive account deletion. The FK is `ON DELETE SET NULL` (see
// 20260418000000_add_user_portal_schema.sql:53), so the user_id column is
// quietly cleared and the registration row stays intact. This is
// intentional: deleting a user account should not nuke historical
// registrations.
//
// Service-role bypasses RLS + the auth.admin namespace requires the service
// key anyway.

// @deno-types="npm:@supabase/supabase-js"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500);
  }

  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json({ error: 'Missing auth' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

  // Gate: only super_admins can delete user accounts.
  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileErr) return json({ error: 'Profile lookup failed' }, 500);
  if (callerProfile?.role !== 'super_admin') {
    return json({ error: 'Forbidden — super_admin only' }, 403);
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const targetUserId = (body.userId || '').trim();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!targetUserId || !UUID_RE.test(targetUserId)) {
    return json({ error: 'Valid userId (uuid) required' }, 400);
  }

  // Prevent a super-admin from deleting their own account through this path
  // — too easy to lock yourself out by accident. (They can still delete
  // their own auth user via the Supabase dashboard if they truly want to.)
  if (targetUserId === userData.user.id) {
    return json({ error: 'You cannot delete your own account from this tool.' }, 400);
  }

  // Pre-check: refuse to delete another super_admin. Demote first if needed.
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('role, email')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetProfile?.role === 'super_admin') {
    return json({ error: 'Cannot delete another super_admin. Demote them in the admin tab first.' }, 400);
  }

  const targetEmail = targetProfile?.email ?? '(unknown email)';

  const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteErr) {
    return json({ error: `Delete failed: ${deleteErr.message}` }, 500);
  }

  return json({ success: true, deletedUserId: targetUserId, deletedEmail: targetEmail });
});
