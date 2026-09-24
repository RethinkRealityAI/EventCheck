// account-claim — "create your account" for the holder of one ticket.
//
// Reached from the /#/account?token=… link in a ticket email. It exists for the
// people our link-by-email triggers cannot serve on their own:
//   * a companion registered under the PURCHASER's email (TSCS India lets a
//     buyer type one address for everyone) — they need their own address
//     before they can have an account at all;
//   * anyone registered offline who has never had a portal account and would
//     otherwise have to discover that "sign up with the same email" links the
//     ticket.
//
// Actions (all public, token-gated):
//   resolve — who the ticket is for, and whether an account can be made.
//   claim   — { email, password }:
//               own, emailed address → create a PRE-VERIFIED account there (the
//                 link reached that inbox, which proves it). The client then
//                 signs in with the password.
//               a new address        → move the ticket there (clearing the
//                 purchaser's account from it), then the CLIENT signs up
//                 normally and confirms by email. If an account already exists
//                 at that address the move links the ticket to it and they
//                 just sign in.
//
// The decisions live in _shared/accountClaim.ts (pure, unit-tested). Security:
// the token (kind 'account') is the credential and is refused by every other
// verifier; a ticket already linked to an account at its own address is never
// touched; a new address is never pre-verified; the purchaser's address is
// never a destination. Name, category and payment are not writable here.
//
// AUTH: gateway-open (verify_jwt=false) — the person has no session yet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyAccountToken } from '../_shared/registrationToken.ts';
import {
  claimStateOf,
  planClaim,
  CLAIM_REJECT_MESSAGES,
  MOVED_TO_KEY,
} from '../_shared/accountClaim.ts';
import { eventDisplayName } from '../_shared/customTicket.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-supabase-client-platform / x-supabase-api-version are load-bearing: the
  // browser SDK sends them on the preflight (§18 CORS gotcha).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TOKEN_MESSAGES: Record<string, string> = {
  expired: 'This link has expired. Please contact the congress team for a new one.',
  malformed: 'This link is incomplete. Please use the full link from your email.',
  'bad-signature': 'This link is not valid. Please use the link from your email.',
  'wrong-kind': 'This link is not an account link. Please use the "create your account" link from your email.',
};

const MIN_PASSWORD = 8;

function firstName(row: any): string {
  const f = row?.answers?.f_fname;
  if (typeof f === 'string' && f.trim()) return f.trim();
  return String(row?.name ?? '').trim().split(/\s+/)[0] || 'there';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const v = await verifyAccountToken(String(body?.token ?? ''), serviceKey, Date.now());
    if (!v.valid) return json({ error: v.reason, message: TOKEN_MESSAGES[v.reason] }, 400);

    const svc = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: row } = await svc
      .from('attendees')
      .select('id, form_id, name, email, user_id, guest_type, primary_attendee_id, ticket_type, is_test, answers')
      .eq('id', v.attendeeId)
      .maybeSingle();
    if (!row) return json({ error: 'not-found', message: 'We could not find this ticket. Please contact the congress team.' }, 404);

    let purchaser: { name: string | null; email: string | null } | null = null;
    if (row.primary_attendee_id) {
      const { data } = await svc.from('attendees').select('name, email').eq('id', row.primary_attendee_id).maybeSingle();
      purchaser = data ?? null;
    }
    const state = claimStateOf(row, purchaser?.email);

    if (action === 'resolve') {
      const { data: form } = await svc.from('forms').select('title').eq('id', row.form_id).maybeSingle();
      return json({
        ok: true,
        eventName: eventDisplayName((form as any)?.title),
        attendee: {
          firstName: firstName(row),
          name: row.name,
          ticketType: row.ticket_type,
          // A shared address is the purchaser's, not theirs — don't offer it.
          email: state.kind === 'open' && state.sharedEmail ? null : row.email,
        },
        purchaserName: purchaser?.name ?? null,
        state: state.kind,
        sharedEmail: state.kind === 'open' ? state.sharedEmail : false,
      });
    }

    if (action !== 'claim') return json({ error: 'unknown-action' }, 400);

    const password = String(body?.password ?? '');
    const requested = String(body?.email ?? '');
    const plan = planClaim(state, row, requested, purchaser?.email);

    if (plan.action === 'reject') {
      const status = plan.reason === 'already-linked' ? 409 : 400;
      return json({ error: plan.reason, message: CLAIM_REJECT_MESSAGES[plan.reason] }, status);
    }

    if (plan.action === 'create-verified') {
      if (password.length < MIN_PASSWORD) {
        return json({ error: 'weak-password', message: `Please choose a password of at least ${MIN_PASSWORD} characters.` }, 400);
      }
      const email = String(row.email).trim().toLowerCase();
      const { data: created, error: createErr } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: row.name ?? '', role: 'attendee' },
      });
      if (createErr || !created?.user) {
        const msg = (createErr?.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          return json({ error: 'already-exists', message: CLAIM_REJECT_MESSAGES['already-linked'], email }, 409);
        }
        console.error('[account-claim] createUser failed', JSON.stringify({ attendeeId: row.id, detail: createErr?.message }));
        return json({ error: 'create-failed', message: 'We could not create your account just now. Please try again in a minute.' }, 500);
      }
      // link_attendees_to_new_user has linked every row at this address.
      return json({ ok: true, next: 'sign-in', email });
    }

    if (plan.action === 'signup-unverified') {
      return json({ ok: true, next: 'sign-up', email: String(row.email).trim().toLowerCase() });
    }

    // plan.action === 'move'
    const answers = {
      ...(row.answers ?? {}),
      f_email: plan.email,
      [MOVED_TO_KEY]: plan.email,
      account_claim_previous_email: row.email,
      account_claim_moved_at: new Date().toISOString(),
    };
    // user_id: null drops the PURCHASER's account from this ticket. The
    // relink_attendee_on_email_change trigger then points it at an existing
    // account at the new address if there is one, and otherwise leaves it
    // empty for link_attendees_to_new_user to fill at sign-up.
    // Guarded on the email we read, so two tabs cannot both move it.
    const { data: moved, error: moveErr } = await svc
      .from('attendees')
      .update({ email: plan.email, user_id: null, answers })
      .eq('id', row.id)
      .eq('email', row.email)
      .select('user_id')
      .maybeSingle();
    if (moveErr || !moved) {
      console.error('[account-claim] move failed', JSON.stringify({ attendeeId: row.id, detail: moveErr?.message }));
      return json({ error: 'move-failed', message: 'We could not update your ticket just now. Please reload the page and try again.' }, 409);
    }
    console.log('[account-claim] ticket moved to a new address', JSON.stringify({ attendeeId: row.id, linkedExisting: !!moved.user_id }));
    return json({ ok: true, next: moved.user_id ? 'sign-in-existing' : 'sign-up', email: plan.email });
  } catch (e) {
    console.error('[account-claim] server error', String(e));
    return json({ error: 'server-error', message: 'Something went wrong on our side. Please try again in a minute.' }, 500);
  }
});
