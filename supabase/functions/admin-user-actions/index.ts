// supabase/functions/admin-user-actions/index.ts
//
// Admin account management from the dashboard — so the team never has to open
// the Supabase dashboard to help a registrant who can't get in.
//
// Actions (all take `{ action, ... }`):
//   lookup            — does this email have an auth account? confirmed? role?
//   send-recovery     — password-reset link to an existing account
//   send-magic-link   — passwordless sign-in link
//   set-password      — set a known password directly (super_admin only)
//   confirm-email     — mark an unverified address confirmed (unblocks sign-in)
//   create-account    — create a PRE-VERIFIED account for an attendee who has
//                       none, with a temp password returned to the admin
//
// WHY WE MINT OUR OWN LINKS
// `admin.generateLink` returns an `action_link` pointing at Supabase's /verify
// endpoint, which then redirects with a PKCE `?code=` — and that only completes
// in the SAME browser that started the flow. Cross-device (admin generates,
// user clicks on their phone) it fails with "session not found" — the exact
// 2026-06-30 incident. We therefore take `properties.hashed_token` and build
// `<origin>/#/reset-password?token_hash=...&type=recovery`, which the app's
// handleSupabaseAuthCallback resolves via verifyOtp — no verifier needed, so it
// works on any device. Same shape as the Supabase email templates already in use.
//
// Delivery goes through send-ticket-email (Resend on GANSID, IONOS on SCAGO)
// rather than Supabase Auth SMTP, so these land with the same branding and
// deliverability as every other app email.
//
// AUTHORIZATION
//   * Gateway verify_jwt = true.
//   * Caller must be admin or super_admin AND hold the `manageUsers` feature.
//   * `set-password` is super_admin ONLY (it grants full impersonation).
//   * A super_admin target can NEVER be acted on. An admin target requires a
//     super_admin caller. Both rules apply to every action.

// @deno-types="npm:@supabase/supabase-js"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { buildAppUrl, resolveOrigin } from '../_shared/emailLinks.ts';
import { canCallerActOnTarget, generateTempPassword, ADMIN_USER_ACTIONS } from '../_shared/adminUserActions.ts';

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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Find an auth user by email without paging the whole project. */
async function findAuthUserByEmail(admin: any, email: string): Promise<any | null> {
  // listUsers supports a filter on newer gotrue builds; fall back to the
  // profiles table (1:1 with auth.users via handle_new_user) then getUserById.
  const { data: prof } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (prof?.id) {
    const { data } = await admin.auth.admin.getUserById(prof.id);
    if (data?.user) return data.user;
  }
  // Profile row missing (rare — trigger failure). Page as a last resort.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const hit = data.users.find((u: any) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Mint a cross-device-safe app link for a recovery / magic-link flow. */
async function buildOtpLink(
  admin: any,
  type: 'recovery' | 'magiclink',
  email: string,
  origin: string,
): Promise<{ link: string; error?: string }> {
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data?.properties?.hashed_token) {
    return { link: '', error: error?.message || 'link generation failed' };
  }
  const tokenHash = data.properties.hashed_token as string;
  const path = type === 'recovery'
    ? `/#/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
    : `/#/portal?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;
  return { link: buildAppUrl(origin, path) };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'Server misconfigured' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json({ error: 'Missing auth' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) return json({ error: 'Invalid session' }, 401);

  const { data: callerProfile } = await admin
    .from('profiles').select('role, admin_permissions').eq('id', userData.user.id).maybeSingle();
  const callerRole = (callerProfile as any)?.role ?? '';
  if (callerRole !== 'admin' && callerRole !== 'super_admin') {
    return json({ error: 'Forbidden — admin only' }, 403);
  }
  // `manageUsers` defaults to DENIED for plain admins (unlike exportAttendees):
  // these actions can hand over access to someone else's account, so they must
  // be granted explicitly by a super_admin.
  const manageUsers = callerRole === 'super_admin'
    || (callerProfile as any)?.admin_permissions?.features?.manageUsers === true;
  if (!manageUsers) return json({ error: 'Forbidden — user management not enabled for your account' }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const action = String(body.action || '');
  if (!ADMIN_USER_ACTIONS.includes(action as any)) return json({ error: 'unknown-action' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Valid email required' }, 400);

  const origin = resolveOrigin(req.headers.get('Origin'), Deno.env.get('PUBLIC_SITE_URL'));
  if (!origin) return json({ error: 'origin unavailable (set PUBLIC_SITE_URL)' }, 400);

  const targetUser = await findAuthUserByEmail(admin, email);

  // Target-role guard — applies to EVERY action, including lookup-adjacent ones.
  let targetRole = '';
  if (targetUser) {
    const { data: tp } = await admin.from('profiles').select('role').eq('id', targetUser.id).maybeSingle();
    targetRole = (tp as any)?.role ?? '';
  }
  const guard = canCallerActOnTarget(callerRole, targetRole, action);
  if (!guard.allowed) return json({ error: guard.reason }, 403);

  // ── lookup ────────────────────────────────────────────────────────────────
  if (action === 'lookup') {
    return json({
      ok: true,
      exists: !!targetUser,
      userId: targetUser?.id ?? null,
      emailConfirmed: !!targetUser?.email_confirmed_at,
      lastSignInAt: targetUser?.last_sign_in_at ?? null,
      role: targetRole || null,
    });
  }

  // Every remaining action except create-account needs the account to exist.
  if (action !== 'create-account' && !targetUser) {
    return json({ error: 'no-account', message: 'No portal account exists for this email. Use "Create account" first.' }, 404);
  }

  // ── create-account ────────────────────────────────────────────────────────
  if (action === 'create-account') {
    if (targetUser) {
      return json({ error: 'already-exists', message: 'A portal account already exists for this email.' }, 409);
    }
    const tempPassword = generateTempPassword();
    const fullName = String(body.fullName || '').trim();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,                 // pre-verified: no Supabase email, admin relays the password
      user_metadata: { full_name: fullName, role: 'attendee' },
    });
    if (createErr || !created?.user) {
      return json({ error: 'create-failed', message: createErr?.message || 'unknown' }, 400);
    }
    // The link_attendees_to_new_user AFTER-INSERT trigger back-links every
    // attendee row on this address, so their tickets appear in the portal.
    return json({
      ok: true,
      userId: created.user.id,
      tempPassword,
      loginUrl: buildAppUrl(origin, '/#/'),
    });
  }

  // ── confirm-email ─────────────────────────────────────────────────────────
  if (action === 'confirm-email') {
    if (targetUser.email_confirmed_at) return json({ ok: true, alreadyConfirmed: true });
    const { error } = await admin.auth.admin.updateUserById(targetUser.id, { email_confirm: true });
    if (error) return json({ error: 'confirm-failed', message: error.message }, 400);
    return json({ ok: true });
  }

  // ── set-password (super_admin only — enforced in canCallerActOnTarget) ────
  if (action === 'set-password') {
    const password = String(body.password || '');
    if (password.length < 8) return json({ error: 'weak-password', message: 'Password must be at least 8 characters.' }, 400);
    const { error } = await admin.auth.admin.updateUserById(targetUser.id, {
      password,
      email_confirm: true,   // a set password is useless if the address is still unconfirmed
    });
    if (error) return json({ error: 'set-password-failed', message: error.message }, 400);
    return json({ ok: true, loginUrl: buildAppUrl(origin, '/#/') });
  }

  // ── send-recovery / send-magic-link ───────────────────────────────────────
  const type = action === 'send-recovery' ? 'recovery' : 'magiclink';
  const { link, error: linkErr } = await buildOtpLink(admin, type, email, origin);
  if (!link) return json({ error: 'link-failed', message: linkErr }, 400);

  // Deliver through the app's own mailer. If the admin only wants the URL to
  // relay by hand (e.g. the user's mail is bouncing), `deliver: false` returns
  // it without sending.
  const deliver = body.deliver !== false;
  let emailSent = false;
  let emailError: string | null = null;
  if (deliver) {
    try {
      const isRecovery = type === 'recovery';
      const subject = isRecovery ? 'Reset your password' : 'Your sign-in link';
      const label = isRecovery ? 'Reset my password' : 'Sign me in';
      const intro = isRecovery
        ? 'We received a request to reset the password for your account.'
        : 'Use the button below to sign in — no password needed.';
      const message = `<p>Hi{{name}},</p><p>${intro}</p>`
        + `<p style="margin:24px 0;"><a href="${link}" style="background:#ba0028;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">${label}</a></p>`
        + `<p style="font-size:13px;color:#64748b;">If the button doesn't work, paste this into your browser:<br>${link}</p>`
        + `<p style="font-size:13px;color:#64748b;">This link can only be used once and expires shortly. If you didn't expect it, you can ignore this email.</p>`;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE}` },
        body: JSON.stringify({ mode: 'raw-html', to: email, subject, message }),
      });
      emailSent = resp.ok;
      if (!resp.ok) emailError = `mailer returned ${resp.status}`;
    } catch (e) {
      emailError = String(e);
    }
  }

  // The link is returned either way so the admin can copy/paste it if delivery
  // failed — that is the whole point of managing this from the dashboard.
  return json({ ok: true, link, emailSent, emailError });
});
