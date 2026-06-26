# Bulk Contacts upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins invite imported contacts to a **free** registration via a signed link (prefilled name/email, no payment, optional portal login), and tag/filter/multi-select contacts to target resends — plus a UX refresh of the import/compose modal.

**Architecture:** Reuse the P4 `registrationToken` HMAC helper (new `kind='invite'` variant) for a stateless invite token encoding `{contactId, formId}`. Attendee rows are created **on completion** (not pre-created) by a token-gated public edge function. Tagging is a `tags text[]` column with the Contacts tab as the audience-picker and the modal as the composer.

**Tech Stack:** React 18 + Vite (HashRouter), Supabase (Deno edge fns, Postgres, Auth), Vitest, jsPDF.

**Spec:** [docs/superpowers/specs/2026-06-26-bulk-contacts-upgrade-design.md](../specs/2026-06-26-bulk-contacts-upgrade-design.md)

**Rules in play:** §16 #2 (edge deploys CLI `--use-api`, BOTH tenants), #3 (CHECK-constraint values), #4 (rowcount checks), #6 (cold audit), #12 (lint→smoke→check migrations), #14 (tests before deploy); §18 (QR payload `JSON.stringify({id})`, CORS allow-list must include `x-supabase-client-platform` + `x-supabase-api-version`, `updateAttendee` treats `undefined` as skip).

> ⚠️ **CRITICAL CONSTRAINT (read before Task 6):** `attendees_payment_method_check` allows ONLY `{card, paypal, cheque, external, promo, bogo}` (+ NULL). The free invite registration MUST insert `payment_method = null` (NOT `'comp'`/`'invite'` — those would 500 like the 2026-06-12 BOGO incident). `payment_status = 'free'` + the `imported_contacts.attendee_id` link already distinguish these rows. Do NOT add a new payment_method value unless you also alter the CHECK on BOTH tenants first (§16 #3).

---

## File structure

- **Create:** `supabase/migrations/20260627000000_bulk_contacts_tags_and_registration.sql`; `supabase/functions/contact-invite-send/index.ts`; `supabase/functions/contact-invite-claim/index.ts`; `tests/inviteToken.test.ts`; `tests/contactTags.test.ts`.
- **Modify:** `supabase/functions/_shared/registrationToken.ts` (add invite token fns); `supabase/functions/send-ticket-email/index.ts` (`contact-register-invite` mode); `supabase/config.toml` (2 stanzas); `services/importedContactsService.ts` (tags + filter + markRegistered + pure helper); `components/Contacts/ImportedContactsTab.tsx` (tags/filter/multi-select/bulk bar); `components/BulkImport/BulkImportModal.tsx` (UX + invite mode + form picker + import tagging); `components/PublicRegistration.tsx` (`?invite=` path).

---

## Task 1: Migration — tags + registration link columns

**Files:**
- Create: `supabase/migrations/20260627000000_bulk_contacts_tags_and_registration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Tagging + free invite-to-register linkage for bulk-imported contacts.
ALTER TABLE public.imported_contacts
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS attendee_id UUID REFERENCES public.attendees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

-- Seed multi-tags from the existing single batch tag (one-time, idempotent-safe).
UPDATE public.imported_contacts
  SET tags = ARRAY[tag]
  WHERE tag IS NOT NULL AND tag <> '' AND (tags IS NULL OR tags = '{}'::text[]);

CREATE INDEX IF NOT EXISTS imported_contacts_tags_idx ON public.imported_contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS imported_contacts_attendee_id_idx ON public.imported_contacts (attendee_id);
```

- [ ] **Step 2: Lint**

Run: `npm run lint:migrations`
Expected: `✓ lint-migrations: N files clean`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260627000000_bulk_contacts_tags_and_registration.sql
git commit -m "feat(contacts): migration for contact tags + registration linkage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Apply to tenants in Task 10 (batched), not here.

---

## Task 2: Invite token (extend registrationToken) — TDD

**Files:**
- Modify: `supabase/functions/_shared/registrationToken.ts` (ADD functions; do NOT change existing `signRegistrationToken`/`verifyRegistrationToken`)
- Test: `tests/inviteToken.test.ts`

The existing helper is pure Web-Crypto and importable by vitest. Cross-use is naturally prevented: an invite token has no `a` field (→ `verifyRegistrationToken` returns `malformed`), and a download token has no `k:'invite'` (→ `verifyInviteToken` returns `wrong-kind`).

- [ ] **Step 1: Write the failing test**

Create `tests/inviteToken.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  signInviteToken, verifyInviteToken,
  signRegistrationToken, verifyRegistrationToken,
} from '../supabase/functions/_shared/registrationToken';

const SECRET = 'test-secret-xyz';
const NOW = 1_750_000_000_000;
const TTL = 60 * 24 * 60 * 60 * 1000;

describe('inviteToken', () => {
  it('round-trips', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    expect(await verifyInviteToken(t, SECRET, NOW + 1000)).toEqual({ valid: true, contactId: 'contact-1', formId: 'form-9' });
  });
  it('rejects tampered signature', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    const [b, s] = t.split('.');
    const flipped = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(await verifyInviteToken(`${b}.${flipped}`, SECRET, NOW)).toEqual({ valid: false, reason: 'bad-signature' });
  });
  it('rejects wrong secret', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    expect(await verifyInviteToken(t, 'other', NOW)).toEqual({ valid: false, reason: 'bad-signature' });
  });
  it('rejects expired', async () => {
    const t = await signInviteToken('contact-1', 'form-9', SECRET, NOW, 1000);
    expect(await verifyInviteToken(t, SECRET, NOW + 2000)).toEqual({ valid: false, reason: 'expired' });
  });
  it('rejects malformed', async () => {
    expect(await verifyInviteToken('garbage', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
  });
  it('cannot cross-use a download token as an invite token', async () => {
    const dl = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyInviteToken(dl, SECRET, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('wrong-kind');
  });
  it('cannot cross-use an invite token as a download token', async () => {
    const inv = await signInviteToken('contact-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyRegistrationToken(inv, SECRET, NOW);
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fails** — `npm test -- inviteToken` → FAIL (functions not exported).

- [ ] **Step 3: Add the implementation** to the END of `supabase/functions/_shared/registrationToken.ts` (reusing the existing private `b64urlEncode`/`b64urlDecodeToString`/`hmacBase64Url`/`timingSafeEqual`):

```ts
export interface InviteTokenPayload {
  k: 'invite';
  c: string; // imported_contacts id
  f: string; // form id
  iat: number;
  exp: number;
}

export type InviteVerifyResult =
  | { valid: true; contactId: string; formId: string }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-kind' };

export async function signInviteToken(
  contactId: string, formId: string, secret: string, nowMs: number, ttlMs: number,
): Promise<string> {
  const payload: InviteTokenPayload = { k: 'invite', c: contactId, f: formId, iat: nowMs, exp: nowMs + ttlMs };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(secret, body);
  return `${body}.${sig}`;
}

export async function verifyInviteToken(
  token: string, secret: string, nowMs: number,
): Promise<InviteVerifyResult> {
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };
  const [body, sig] = parts;
  let payload: InviteTokenPayload;
  try { payload = JSON.parse(b64urlDecodeToString(body)); }
  catch { return { valid: false, reason: 'malformed' }; }
  if (!payload || typeof payload.c !== 'string' || typeof payload.f !== 'string' || typeof payload.exp !== 'number') {
    return { valid: false, reason: 'malformed' };
  }
  const expected = await hmacBase64Url(secret, body);
  if (!timingSafeEqual(sig, expected)) return { valid: false, reason: 'bad-signature' };
  if (payload.k !== 'invite') return { valid: false, reason: 'wrong-kind' };
  if (nowMs > payload.exp) return { valid: false, reason: 'expired' };
  return { valid: true, contactId: payload.c, formId: payload.f };
}
```

> Note ordering: signature is checked BEFORE `k`/`exp` so a forged-kind token still fails on signature first.

- [ ] **Step 4: Run → passes** — `npm test -- inviteToken` → PASS (7 tests). Also `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/registrationToken.ts tests/inviteToken.test.ts
git commit -m "feat(contacts): add invite-token sign/verify (kind='invite')

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: importedContactsService — tags, filter, markRegistered + pure helper

**Files:**
- Modify: `services/importedContactsService.ts`
- Test: `tests/contactTags.test.ts`

> Read `services/importedContactsService.ts` first (the `ImportedContact` interface ~lines 25-38, `mapContact` ~58-73, `getImportedContacts` ~147-167).

- [ ] **Step 1: Write the failing test** (`tests/contactTags.test.ts`) for the pure tag-filter helper:

```ts
import { describe, it, expect } from 'vitest';
import { contactMatchesTags } from '../services/importedContactsService';

describe('contactMatchesTags', () => {
  const c = (tags: string[]) => ({ tags } as any);
  it('matches when no filter tags', () => {
    expect(contactMatchesTags(c(['vip']), [])).toBe(true);
  });
  it('matches when contact has ANY selected tag (OR semantics)', () => {
    expect(contactMatchesTags(c(['vip', 'hospital-x']), ['speakers', 'hospital-x'])).toBe(true);
  });
  it('does not match when contact shares none', () => {
    expect(contactMatchesTags(c(['vip']), ['speakers'])).toBe(false);
  });
  it('handles missing tags array', () => {
    expect(contactMatchesTags({} as any, ['vip'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fails.** `npm test -- contactTags` → FAIL.

- [ ] **Step 3: Implement.** In `services/importedContactsService.ts`:

(a) Add `tags: string[]` and `attendeeId: string | null`, `registeredAt: string | null` to the `ImportedContact` interface and to `mapContact` (`tags: (r.tags as string[]) ?? []`, `attendeeId: r.attendee_id ?? null`, `registeredAt: r.registered_at ?? null`).

(b) Add the pure helper + tag/filter functions:

```ts
/** OR-semantics: a contact matches when it carries at least one of the selected tags (empty filter = match all). */
export function contactMatchesTags(c: { tags?: string[] }, selected: string[]): boolean {
  if (!selected || selected.length === 0) return true;
  const own = c.tags ?? [];
  return selected.some(t => own.includes(t));
}

export async function listDistinctTags(): Promise<string[]> {
  const { data, error } = await supabase.from('imported_contacts').select('tags');
  if (error) { console.error('listDistinctTags failed', error); return []; }
  const set = new Set<string>();
  for (const row of data ?? []) for (const t of ((row as any).tags ?? [])) set.add(t);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Add tags to many contacts (union, no dupes). Returns affected count. */
export async function addTagsToContacts(ids: string[], tags: string[]): Promise<number> {
  if (ids.length === 0 || tags.length === 0) return 0;
  let affected = 0;
  for (const id of ids) {
    const { data: row } = await supabase.from('imported_contacts').select('tags').eq('id', id).maybeSingle();
    const next = Array.from(new Set([...(((row as any)?.tags) ?? []), ...tags]));
    const { data, error } = await supabase.from('imported_contacts').update({ tags: next }).eq('id', id).select('id');
    if (!error && (data?.length ?? 0) > 0) affected++;
  }
  return affected;
}

export async function removeTagFromContacts(ids: string[], tag: string): Promise<number> {
  if (ids.length === 0) return 0;
  let affected = 0;
  for (const id of ids) {
    const { data: row } = await supabase.from('imported_contacts').select('tags').eq('id', id).maybeSingle();
    const next = (((row as any)?.tags) ?? []).filter((t: string) => t !== tag);
    const { data, error } = await supabase.from('imported_contacts').update({ tags: next }).eq('id', id).select('id');
    if (!error && (data?.length ?? 0) > 0) affected++;
  }
  return affected;
}
```

(c) When creating contacts (`createImportBatch`), accept an optional `tags?: string[]` on `NewContactInput` and write it to the insert payload (`tags: c.tags ?? []`).

- [ ] **Step 4: Run → passes.** `npm test -- contactTags` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add services/importedContactsService.ts tests/contactTags.test.ts
git commit -m "feat(contacts): tag CRUD + filter helper + registration fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: send-ticket-email — `contact-register-invite` mode

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts`

> Read the `group-invite` mode (~lines 164-209) first; mirror its structure and the `app_settings` SMTP read.

- [ ] **Step 1:** Add this mode block after `group-invite`:

```ts
// ── CONTACT REGISTER INVITE: emails an imported contact a FREE registration link ──
// Body: { mode: 'contact-register-invite', to, subject, html }  (html pre-rendered by caller)
if (body.mode === 'contact-register-invite') {
    const { to, subject, html } = body;
    if (!to || !subject || !html) return jsonResponse({ error: 'Missing to/subject/html' }, 400);
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: appSettings } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    const s = (appSettings as any) || {};
    const smtpConfig = appSettings
        ? { host: s.smtp_host, port: Number(s.smtp_port || 587), user: s.smtp_user, pass: s.smtp_pass, fromName: s.email_from_name || 'SCAGO' }
        : undefined;
    await sendSimpleEmail({ to, subject, html, smtpConfig });
    return jsonResponse({ ok: true });
}
```

> The caller (Task 5) renders the branded HTML with the registration link already substituted (reusing the same `emailShell` path the bulk campaign uses), so this mode is a thin pre-rendered sender like `raw-html` but kept distinct for clarity/attribution.

- [ ] **Step 2:** `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "feat(contacts): add contact-register-invite email mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `contact-invite-send` edge function (admin-gated)

**Files:**
- Create: `supabase/functions/contact-invite-send/index.ts`
- Modify: `supabase/config.toml`

> Read an existing admin-gated function (`supabase/functions/admin-invite/index.ts`) for the exact admin-assertion pattern (createClient with the caller's Authorization header → `getUser()` → query `profiles.role`). Mirror it.

- [ ] **Step 1: Create the function:**

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signInviteToken } from '../_shared/registrationToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Admin gate: the caller's JWT must belong to an admin/super_admin. ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser();
    if (uErr || !user) return json({ error: 'unauthorized' }, 401);
    const svc = createClient(url, serviceKey);
    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'super_admin'].includes((profile as any).role)) return json({ error: 'forbidden' }, 403);

    const { contactId, formId, origin, subject, html } = await req.json();
    if (!contactId || !formId || !origin || !subject || !html) return json({ error: 'missing-fields' }, 400);

    const { data: contact } = await svc.from('imported_contacts').select('id, email').eq('id', contactId).maybeSingle();
    if (!contact || !(contact as any).email) return json({ error: 'contact-not-found' }, 404);

    // Mint the invite link and inject it as {{registration_link}}.
    const token = await signInviteToken(contactId, formId, serviceKey, Date.now(), TTL_MS);
    const link = `${origin}/#/form/${formId}?invite=${encodeURIComponent(token)}`;
    const renderedHtml = String(html).replace(/\{\{registration_link\}\}/g, link);
    const renderedSubject = String(subject);

    // Send via send-ticket-email's pre-rendered mode.
    const resp = await fetch(`${url}/functions/v1/send-ticket-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ mode: 'contact-register-invite', to: (contact as any).email, subject: renderedSubject, html: renderedHtml }),
    });
    if (!resp.ok) {
      await svc.from('imported_contacts').update({ email_status: 'failed', email_error: `send ${resp.status}` }).eq('id', contactId);
      return json({ error: 'send-failed', status: resp.status }, 502);
    }
    await svc.from('imported_contacts').update({ email_status: 'sent', email_sent_at: new Date().toISOString(), email_subject: renderedSubject }).eq('id', contactId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
```

- [ ] **Step 2:** Add to `supabase/config.toml`:

```toml
# Admin-only. Mints a signed free-registration invite token for an imported
# contact and emails the link. Gateway requires a JWT; the function additionally
# asserts the caller is an admin/super_admin before signing anything.
[functions.contact-invite-send]
verify_jwt = true
```

- [ ] **Step 3:** `npx tsc --noEmit` clean. **Commit:**

```bash
git add supabase/functions/contact-invite-send/index.ts supabase/config.toml
git commit -m "feat(contacts): contact-invite-send edge fn (admin-gated invite minting)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `contact-invite-claim` edge function (public, token-gated)

**Files:**
- Create: `supabase/functions/contact-invite-claim/index.ts`
- Modify: `supabase/config.toml`

> Read the P4 `registration-confirmed` mode call in `verify-payment` (the `sendRegistrationConfirmedEmail` helper) to mirror how the confirmation email + download link are built. Read the verify-payment **free branch insert** (~lines 1958-1986) to match the exact `attendees` columns set on a free insert.

- [ ] **Step 1: Create the function** (⚠️ `payment_method: null` — see the CRITICAL note at the top):

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyInviteToken, signRegistrationToken } from '../_shared/registrationToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const DOWNLOAD_TTL_MS = 180 * 24 * 60 * 60 * 1000;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const body = await req.json();
    const { action, token } = body;

    const v = await verifyInviteToken(token ?? '', serviceKey, Date.now());
    if (!v.valid) return json({ error: 'invalid-token', reason: v.reason }, 400);

    const svc = createClient(url, serviceKey);
    const { data: contact } = await svc.from('imported_contacts').select('*').eq('id', v.contactId).maybeSingle();
    if (!contact) return json({ error: 'contact-not-found' }, 404);

    if (action === 'resolve') {
      return json({
        contactName: (contact as any).name ?? '',
        contactEmail: (contact as any).email ?? '',
        formId: v.formId,
        alreadyRegistered: !!(contact as any).attendee_id,
      });
    }

    if (action === 'register') {
      if ((contact as any).attendee_id) {
        return json({ error: 'already-registered', attendeeId: (contact as any).attendee_id }, 409);
      }
      const name = (body.name ?? (contact as any).name ?? '').toString();
      const email = (body.email ?? (contact as any).email ?? '').toString();
      const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
      if (!email) return json({ error: 'email-required' }, 400);

      const id = crypto.randomUUID();
      const row = {
        id,
        form_id: v.formId,
        name,
        email,
        answers,
        ticket_type: 'Invited (free)',
        payment_status: 'free',
        payment_method: null,           // ⚠️ MUST be null — see CRITICAL note (CHECK constraint)
        payment_amount: '0.00',
        qr_payload: JSON.stringify({ id }),
        registered_at: new Date().toISOString(),
        is_primary: true,
      };
      const { error: insErr } = await svc.from('attendees').insert(row);
      if (insErr) return json({ error: 'insert-failed', detail: insErr.message }, 500);

      // Link the contact → registered. Rowcount-checked (§16 #4).
      const { data: upd } = await svc.from('imported_contacts')
        .update({ attendee_id: id, registered_at: new Date().toISOString() })
        .eq('id', v.contactId).select('id');
      if (!upd || upd.length === 0) console.error('contact-invite-claim: contact link update affected 0 rows', v.contactId);

      // Reuse P4 registration-confirmed email (download link). Best-effort.
      try {
        const origin = (body.origin ?? req.headers.get('origin') ?? Deno.env.get('PUBLIC_SITE_URL') ?? '').toString();
        const dlToken = await signRegistrationToken(id, v.formId, serviceKey, Date.now(), DOWNLOAD_TTL_MS);
        const downloadUrl = `${origin}/#/tickets?token=${encodeURIComponent(dlToken)}`;
        await fetch(`${url}/functions/v1/send-ticket-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ mode: 'registration-confirmed', primaryAttendeeId: id, downloadUrl }),
        });
      } catch (e) { console.error('contact-invite-claim: confirmation email failed', String(e)); }

      return json({ ok: true, attendeeId: id });
    }

    return json({ error: 'unknown-action' }, 400);
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
```

> Confirm against the verify-payment free insert: if it sets additional non-null-defaulted columns (e.g. `registered_at` naming, `is_test`), match them. Do NOT set columns that don't exist. The `link_attendee_to_existing_user` BEFORE-INSERT trigger will auto-set `user_id` if the email already has an auth account — leave `user_id` unset.

- [ ] **Step 2:** Add to `supabase/config.toml`:

```toml
# Public, token-gated. Resolves an invite token to a contact's name/email for
# prefill, and registers them FREE on completion. The HMAC token is the
# credential; the function trusts NOTHING from the client for the free grant.
[functions.contact-invite-claim]
verify_jwt = false
```

- [ ] **Step 3:** `npx tsc --noEmit` clean. **Commit:**

```bash
git add supabase/functions/contact-invite-claim/index.ts supabase/config.toml
git commit -m "feat(contacts): contact-invite-claim edge fn (resolve + free register)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: PublicRegistration — `?invite=<token>` free path

**Files:**
- Modify: `components/PublicRegistration.tsx`

> Read first: the `?ref=` handling (~lines 131-134 for the param, ~462-557 for the guest-claim effect), the payment-step gate (`needsPaymentStep` ~line 586), the free finalize routes (~lines 972-989), and the optional portal-signup block (~lines 877-895). You will add a PARALLEL `invite` path that reuses these patterns.

- [ ] **Step 1: Parse the invite token** near the existing `guestRef` parse (~line 133):

```ts
const inviteToken = searchParams.get('invite');
```

Add state:
```ts
const [inviteMode, setInviteMode] = useState(false);
const [inviteResolved, setInviteResolved] = useState<{ name: string; email: string } | null>(null);
```

- [ ] **Step 2: Resolve + prefill on load.** Add a `useEffect` (mirroring the `?ref=` effect) that, when `inviteToken` is present, calls the edge fn and prefills:

```ts
useEffect(() => {
  if (!inviteToken || !form) return;
  let cancelled = false;
  (async () => {
    const { data, error } = await supabase.functions.invoke('contact-invite-claim', { body: { action: 'resolve', token: inviteToken } });
    if (cancelled) return;
    if (error || !data || data.error) { setInviteMode(false); return; }
    setInviteMode(true);
    setInviteResolved({ name: data.contactName || '', email: data.contactEmail || '' });
    // Prefill name/email into answers using the SAME field-detection the profile-prefill effect uses
    // (split first/last name + email field). Reuse that helper/logic.
  })();
  return () => { cancelled = true; };
}, [inviteToken, form]);
```

> Match the form's name/email field ids exactly as the profile-prefill effect (~lines 435-460) does (case-insensitive id/label scan for first/last/email). Reuse that logic rather than duplicating.

- [ ] **Step 3: Force the free path.** Where `needsPaymentStep` is computed (~586), OR it with invite mode so payment is always skipped:

```ts
const needsPaymentStep = !inviteMode && (/* existing expression */);
```

And in the submit routing (~972-989), when `inviteMode`, call the invite finalize (Step 4) instead of `finalizeRegistration`/`verify-payment`.

- [ ] **Step 4: Submit via the claim endpoint.** Add an `finalizeInviteRegistration()` that posts to the edge fn and shows success:

```ts
const finalizeInviteRegistration = async () => {
  const name = resolveDisplayName(form.fields, answers) || inviteResolved?.name || '';
  const emailFieldId = /* same email field detection */;
  const email = (answers[emailFieldId] as string) || inviteResolved?.email || '';
  const { data, error } = await supabase.functions.invoke('contact-invite-claim', {
    body: { action: 'register', token: inviteToken, answers, name, email, origin: window.location.origin },
  });
  if (error || !data?.ok) {
    // friendly error (already-registered → "You're already registered"; else generic)
    showError(/* ... */);
    return;
  }
  setSubmissionId(data.attendeeId);
  setStep('success');
};
```

- [ ] **Step 5: Optional portal signup.** Ensure the existing portal-signup opt-in block on the success screen (~877-895) also renders for `inviteMode` (it keys off `!user && email`), so the invited contact can set a password. No new code if it already gates on `email` + `!user`; otherwise extend its condition to include `inviteMode`.

- [ ] **Step 6:** `npx tsc --noEmit && npm run build` clean.

- [ ] **Step 7: Verify in preview.** Start dev server; load `/#/form/<aRealFormId>?invite=BADTOKEN` → confirm it does NOT crash and falls back to normal (non-invite) rendering (resolve returns error → `inviteMode` stays false). Full happy-path is covered by Task 10's end-to-end smoke.

- [ ] **Step 8: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "feat(contacts): free invite registration path (?invite=token)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: ImportedContactsTab — tags column, tag filter, multi-select, bulk bar

**Files:**
- Modify: `components/Contacts/ImportedContactsTab.tsx`

> Read the full file first (it's ~286 lines). You are extending the existing toolbar + table, not rewriting.

- [ ] **Step 1: Selection state + tag filter state:**

```ts
const [selected, setSelected] = useState<Set<string>>(new Set());
const [tagFilter, setTagFilter] = useState<string[]>([]);   // OR-semantics
const [allTags, setAllTags] = useState<string[]>([]);
```

Load tags in `load()`: `setAllTags(await listDistinctTags())` (import `listDistinctTags`, `addTagsToContacts`, `removeTagFromContacts`, `contactMatchesTags`).

- [ ] **Step 2: Apply the tag filter** inside the existing `filtered` memo:

```ts
if (!contactMatchesTags(c, tagFilter)) return false;
```

Add a `registered` status to the status filter set (a contact is "registered" when `c.registeredAt` is set) and a multi-select tag dropdown in the toolbar (list `allTags`, toggle into `tagFilter`).

- [ ] **Step 3: Checkbox column.** Add a header checkbox ("select all in current filter" → set `selected` to all `filtered` ids) and a per-row checkbox toggling membership in `selected`. Render a **Tags** cell (chips from `c.tags`) replacing the single `Tag` cell (~line 234/254).

- [ ] **Step 4: Bulk action bar** (renders when `selected.size > 0`): "Send registration invite" (opens the modal in invite mode pre-targeted to the selected contacts — Task 9), "Resend campaign" (opens modal resume mode with selected), "Add tag" / "Remove tag" (prompt or dropdown → `addTagsToContacts`/`removeTagFromContacts` over `[...selected]` → reload), "Delete selected". Show the selected count.

- [ ] **Step 5:** `npx tsc --noEmit && npm run build` clean. Verify in preview if an admin session is available; otherwise structural check.

- [ ] **Step 6: Commit**

```bash
git add components/Contacts/ImportedContactsTab.tsx
git commit -m "feat(contacts): tags column + tag filter + multi-select + bulk actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: BulkImportModal — UX refresh + invite mode + form picker + import tagging

**Files:**
- Modify: `components/BulkImport/BulkImportModal.tsx`

> Read the full file first (compose fields ~50-163, `sendOne` ~334-393, `startSend`/throttle ~411-448, props ~79-146).

- [ ] **Step 1: Add an invite mode.** Extend the modal props/state with a `purpose: 'campaign' | 'invite'` and, for invite, a `formId` picker (load active/available forms via the existing forms service). When `resume`/launch carries a target contact set + `purpose='invite'`, the Compose step shows the invite template (with a `{{registration_link}}` note) and a **form dropdown**.

- [ ] **Step 2: Invite send path.** In `sendOne`, when `purpose === 'invite'`, instead of `send-ticket-email raw-html`, call `supabase.functions.invoke('contact-invite-send', { body: { contactId: c.id, formId, origin: window.location.origin, subject: resolvedSubject, html: renderedHtml } })`. Keep the existing `claimContactForSend` throttle/progress machinery. The rendered HTML must include `{{registration_link}}` (the edge fn substitutes the real link per contact).

- [ ] **Step 3: Import-time tagging.** In the import step, add a "Tags" input (comma-separated or chip entry); pass `tags` through to `createImportBatch`'s `NewContactInput` (Task 3c). Add basic dedupe: skip CSV rows whose email already appears earlier in the same upload.

- [ ] **Step 4: UX refresh.** Restructure into clear steps (Audience → Compose → Review & Send → Live progress) with an audience summary; ensure the modal uses `createPortal(…, document.body)` (rule #7), is responsive, and has accessible labels/focus order. Keep the existing live status counters.

- [ ] **Step 5:** `npx tsc --noEmit && npm run build` clean. Verify the modal opens + steps render in preview (bad-token/admin-session caveats per Task 8).

- [ ] **Step 6: Commit**

```bash
git add components/BulkImport/BulkImportModal.tsx
git commit -m "feat(contacts): modal UX refresh + invite mode + form picker + import tagging

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Verify, audit, deploy

- [ ] **Step 1: Full verification.** `npm test && npx tsc --noEmit && npm run build` — all green (incl. `inviteToken` + `contactTags`).

- [ ] **Step 2: Cold-context audit (rule #6).** Dispatch a fresh subagent to audit end-to-end against the spec, specifically: (a) invite token sign (send fn) ↔ verify (claim fn) use the SAME secret + payload shape; (b) **`payment_method` is `null`** on the free insert (NOT a non-allowlisted value — the CHECK constraint); (c) `contact-invite-send` rejects non-admins (401/403); (d) `contact-invite-claim` is idempotent (already-registered → 409) and returns no secrets on `resolve`; (e) the `?invite=` path forces the free path (no payment step) and falls back gracefully on a bad token; (f) tag filter OR-semantics + multi-select bulk actions affect the right rows (rowcount checks). Fix anything found.

- [ ] **Step 3: Apply migration (both tenants).** SCAGO via MCP `apply_migration`; GANSID via CLI (`db query --linked -f` + `migration repair`). Then `npm run smoke:db` + `npm run check:migrations` (rule #12). Verify the new columns + GIN index exist on both.

- [ ] **Step 4: Deploy edge fns (both tenants, CLI `--use-api`):** `contact-invite-send`, `contact-invite-claim` (new), `send-ticket-email` (updated).

```bash
for FN in contact-invite-send contact-invite-claim send-ticket-email; do
  for REF in iigbgbgakevcgilucvbs gticuvgclbvhwvpzkuez; do
    npx --yes supabase functions deploy $FN --project-ref $REF --use-api
  done
done
```

- [ ] **Step 5: Smoke.** `contact-invite-claim` bad token → `400 {"reason":"malformed"}`; `contact-invite-send` without an admin JWT → `401`/`403`. End-to-end: import a test contact → send invite → click link → complete free registration → confirm the attendee row + `imported_contacts.attendee_id` link + the confirmation email. Clean up the test rows.

- [ ] **Step 6: CLAUDE.md** — bump date; §19 entry; §11 (two new edge fns + new email mode); §12 (imported_contacts new columns); §18 (note: invited-free registrations use `payment_method=null`). Commit.

---

## Notes / risks the implementer must resolve

1. **`payment_method` CHECK** — repeated because it's the highest-risk item: free invite inserts use `payment_method = null`. Anything else needs a dual-tenant CHECK migration FIRST (§16 #3).
2. **app_settings column names** — the invite/confirmation email reads `email_from_name`, `smtp_*` — reconcile against `services/storageService.ts` (as in P4).
3. **Form name/email field detection** (Task 7) — reuse the exact logic from the profile-prefill effect; do not invent a new scan.
4. **Admin assertion** (Task 5) — mirror `admin-invite`'s pattern exactly; `SUPABASE_ANON_KEY` must be available to the function (it is, by default).
5. **Confirmation email origin** — `contact-invite-claim/register` builds the `/#/tickets` link from `body.origin` (sent by the form) → falls back to `PUBLIC_SITE_URL`. Ensure the form sends `origin: window.location.origin`.
