// supabase/functions/admin-invite/index.ts
//
// Super-admin-only. Creates a new auth.users row with a random temporary
// password, stamps the matching profile with role='admin' + the supplied
// permissions, and RETURNS the credentials to the caller's UI.
//
// Why a temp password and not Supabase's built-in inviteUserByEmail:
//   * GANSID has Supabase Auth custom-SMTP DISABLED (pending DKIM on the
//     IONOS domain). inviteUserByEmail would fall back to Supabase's
//     default SMTP, which is restricted to the project-owner email only
//     and won't deliver to arbitrary invitees.
//   * Using admin.createUser with email_confirm=true creates a fully-usable
//     account without sending any Supabase email at all. The super admin
//     then shares the credentials with the new admin out-of-band (DM,
//     email via their own provider, etc.).
//
// Uses the service-role key (bypasses RLS + the handle_new_user trigger's
// anti-escalation role filter). Gateway is verify_jwt=true so the caller
// is authenticated.

// @deno-types="npm:@supabase/supabase-js"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

// supabase-js v2.45+ silently injects `x-supabase-api-version` on every
// functions.invoke() call. Browsers will block the preflight (and the user
// sees "Failed to send a request to the Edge Function" / "could not be
// reached") unless that header is in the allow-list. Keep this list in sync
// with whatever supabase-js sends — when in doubt, add the header here.
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

// Generate a 14-char password from an unambiguous alphabet (no 0/O/l/1
// confusables). ~83 bits of entropy — well above any brute-force concern
// for interactive login.
function generateTempPassword(length = 14): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'Server misconfigured: missing Supabase env' }, 500);
  }

  // Derive the caller from the Authorization header. verify_jwt=true on the
  // gateway has already validated the signature; we just need getUser() to
  // resolve the user id.
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json({ error: 'Missing auth' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

  // Gate: only super_admins can invite.
  const { data: callerProfile, error: profileErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileErr) return json({ error: 'Profile lookup failed' }, 500);
  if (callerProfile?.role !== 'super_admin') {
    return json({ error: 'Forbidden — super_admin only' }, 403);
  }

  // Body parsing + validation
  let body: { email?: string; fullName?: string; permissions?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const email = (body.email || '').trim().toLowerCase();
  const fullName = (body.fullName || '').trim();
  const permissions = body.permissions;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Valid email required' }, 400);
  }
  if (!permissions || typeof permissions !== 'object') {
    return json({ error: 'permissions object required' }, 400);
  }

  // If a profile already exists for that email, the caller should use the
  // promote flow instead — creating a duplicate auth user would fail with
  // a 422 anyway.
  const { data: existing } = await admin
    .from('profiles')
    .select('id, role')
    .ilike('email', email)
    .maybeSingle();
  if (existing) {
    return json({
      error: 'A user with that email already exists — use "Promote existing user" instead.',
      alreadyExists: true,
    }, 409);
  }

  // Create the auth.users row with a temporary password. email_confirm=true
  // marks the address as confirmed so the new admin can sign in immediately
  // without clicking anything — no Supabase email is sent.
  const tempPassword = generateTempPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) {
    return json({
      error: `User creation failed: ${createErr?.message || 'unknown'}`,
      alreadyExists: createErr?.message?.toLowerCase().includes('already') ?? false,
    }, 400);
  }

  // The handle_new_user trigger has inserted a profile with role='attendee'
  // (the trigger refuses 'admin' from user_metadata by design). Upsert to
  // force role='admin' + the supplied permissions. Service-role bypasses
  // RLS; prevent_self_role_change trigger short-circuits because
  // auth.uid() is NULL under service-role.
  const { error: upsertErr } = await admin
    .from('profiles')
    .upsert({
      id: created.user.id,
      email: created.user.email,
      full_name: fullName,
      role: 'admin',
      admin_permissions: permissions,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (upsertErr) {
    return json({
      error: `User created but profile setup failed: ${upsertErr.message}. ` +
             `Please promote them manually from the admin dashboard.`,
      userId: created.user.id,
      tempPassword,
    }, 500);
  }

  // Build a login URL for the super admin to share alongside the temp
  // password. Origin is trusted — it was validated by the gateway CORS.
  const origin = req.headers.get('Origin') || '';
  const loginUrl = origin ? `${origin}/#/login` : '/#/login';

  return json({
    success: true,
    userId: created.user.id,
    email: created.user.email,
    tempPassword,
    loginUrl,
  });
});
