// supabase/functions/addon-sync/index.ts
//
// Admin-only, one click: record which paid add-ons (e.g. the Networking
// Reception) each PayPal registrant bought, by reading the line items PayPal
// kept for their order.
//
// Why it exists: until 2026-10-14 verify-payment added an add-on's price to the
// total and then discarded the selection, so nothing on the attendee row said
// who holds a reception ticket. verify-payment now writes answers._addons at
// checkout; this backfills everyone who paid before that. Safe to run again —
// it only ever ADDS ids to answers._addons and never removes one.
//
// Flow per PayPal payment: capture id (attendees.transaction_id) →
// GET /v2/payments/captures/{id} → its "up" link is the order →
// GET the order → purchase_units[].items[].name → _shared/addonLineItems.
//
// Gateway verify_jwt=true; the function additionally asserts admin/super_admin.
// Body: { dryRun?: boolean } — dryRun reports what would change, writes nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { matchAddonLineItems, type AddonDef } from '../_shared/addonLineItems.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Admin gate ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser();
    if (uErr || !user) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(url, serviceKey);
    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes((profile as any).role)) {
      return json({ error: 'forbidden' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    // ── PayPal credentials — same resolution as verify-payment (live unless
    // PAYPAL_MODE=sandbox) ──
    const useSandbox = (Deno.env.get('PAYPAL_MODE') || '').toLowerCase() === 'sandbox';
    const clientId = (useSandbox
      ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_ID') || Deno.env.get('PAYPAL_CLIENT_ID'))
      : Deno.env.get('PAYPAL_CLIENT_ID'))?.trim() || '';
    const clientSecret = (useSandbox
      ? (Deno.env.get('PAYPAL_SANDBOX_CLIENT_SECRET') || Deno.env.get('PAYPAL_CLIENT_SECRET'))
      : Deno.env.get('PAYPAL_CLIENT_SECRET'))?.trim() || '';
    const apiBase = Deno.env.get('PAYPAL_API_BASE')
      || (useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');
    if (!clientId || !clientSecret) return json({ error: 'PayPal credentials not configured' }, 500);

    const authResp = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!authResp.ok) return json({ error: 'PayPal auth failed' }, 502);
    const { access_token } = await authResp.json();
    const pp = (path: string) => fetch(path.startsWith('http') ? path : `${apiBase}${path}`, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    });

    // ── Add-ons every template sells ──
    const { data: templates } = await svc.from('pricing_templates').select('id, addons');
    const addonsByTemplate = new Map<string, AddonDef[]>();
    for (const t of templates ?? []) {
      const list = Array.isArray((t as any).addons) ? (t as any).addons : [];
      addonsByTemplate.set((t as any).id, list.map((a: any) => ({ id: String(a.id), name: String(a.name) })));
    }

    // ── Every real PayPal payment, grouped by capture id (a group order's
    // members share one) ──
    const { data: rows, error: rowsErr } = await svc
      .from('attendees')
      .select('id, name, is_primary, transaction_id, pricing_template_id, answers')
      .eq('payment_method', 'paypal')
      .eq('is_test', false)
      .not('transaction_id', 'is', null);
    if (rowsErr) return json({ error: rowsErr.message }, 500);
    const byTxn = new Map<string, any[]>();
    for (const r of rows ?? []) {
      const key = String((r as any).transaction_id);
      const list = byTxn.get(key) ?? [];
      list.push(r);
      byTxn.set(key, list);
    }

    const summary = {
      dryRun,
      orders: byTxn.size,
      ordersWithItems: 0,
      ordersWithoutItems: 0,
      updated: [] as Array<{ id: string; name: string; addons: string[] }>,
      unmatched: [] as Array<{ transactionId: string; line: string }>,
      errors: [] as Array<{ transactionId: string; error: string }>,
    };

    for (const [txn, group] of byTxn) {
      const tplId = group.find(r => r.pricing_template_id)?.pricing_template_id;
      const addons = tplId ? (addonsByTemplate.get(tplId) ?? []) : [];
      if (addons.length === 0) continue;
      try {
        const capResp = await pp(`/v2/payments/captures/${encodeURIComponent(txn)}`);
        if (!capResp.ok) { summary.errors.push({ transactionId: txn, error: `capture ${capResp.status}` }); continue; }
        const capture = await capResp.json();
        const orderHref = (capture.links ?? []).find((l: any) => l.rel === 'up')?.href;
        if (!orderHref) { summary.errors.push({ transactionId: txn, error: 'no order link' }); continue; }
        const orderResp = await pp(orderHref);
        if (!orderResp.ok) { summary.errors.push({ transactionId: txn, error: `order ${orderResp.status}` }); continue; }
        const order = await orderResp.json();
        const itemNames: string[] = (order.purchase_units ?? [])
          .flatMap((u: any) => u.items ?? [])
          .map((i: any) => String(i.name ?? ''));
        if (itemNames.length === 0) { summary.ordersWithoutItems += 1; continue; }
        summary.ordersWithItems += 1;

        const match = matchAddonLineItems(
          itemNames,
          addons,
          group.map(r => ({ id: r.id, name: r.name ?? '', isPrimary: r.is_primary !== false })),
        );
        for (const line of match.unmatched) summary.unmatched.push({ transactionId: txn, line });

        for (const [attendeeId, found] of Object.entries(match.byAttendee)) {
          const row = group.find(r => r.id === attendeeId);
          const answers = (row?.answers && typeof row.answers === 'object') ? row.answers : {};
          const existing: string[] = Array.isArray(answers._addons) ? answers._addons : [];
          const merged = [...new Set([...existing, ...found])];
          if (merged.length === existing.length) continue;
          if (!dryRun) {
            const { error } = await svc.from('attendees')
              .update({ answers: { ...answers, _addons: merged } })
              .eq('id', attendeeId);
            if (error) { summary.errors.push({ transactionId: txn, error: error.message }); continue; }
          }
          summary.updated.push({ id: attendeeId, name: row?.name ?? '', addons: merged });
        }
      } catch (e) {
        summary.errors.push({ transactionId: txn, error: String(e) });
      }
    }

    return json(summary);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
