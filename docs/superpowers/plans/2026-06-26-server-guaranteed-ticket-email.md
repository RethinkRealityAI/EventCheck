# Server-guaranteed purchaser email + tokenized ticket download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every successful event registration sends the purchaser a confirmation email (server-side, surviving a tab close) containing a secure link to a public page that rebuilds their ticket PDFs in-browser.

**Architecture:** Stateless HMAC token (signed in `verify-payment`, verified by a new `registration-download` edge function) → public `/#/tickets?token=` page reuses the existing client `generateTicketPDF`. The server sends the purchaser email via a new `send-ticket-email` mode; the client stops sending its own purchaser email but keeps per-guest sends.

**Tech Stack:** Deno edge functions (Supabase), Web Crypto HMAC-SHA256, React 18 + Vite (HashRouter), jsPDF (existing), Vitest. No DB migration.

**Spec:** [docs/superpowers/specs/2026-06-26-server-guaranteed-ticket-email-design.md](../specs/2026-06-26-server-guaranteed-ticket-email-design.md)

**Operational rules in play:** §16 #2 (edge deploys CLI `--use-api`, BOTH projects), #4 (rowcount checks), #6 (cold-context audit), #14 (tests before deploy), §18 (QR payload `JSON.stringify({id})`, CORS allow-list must include `x-supabase-client-platform` + `x-supabase-api-version`).

---

## File structure

- **Create** `supabase/functions/_shared/registrationToken.ts` — pure sign/verify (Web Crypto). Importable by Deno AND vitest.
- **Create** `tests/registrationToken.test.ts` — unit tests for the helper.
- **Create** `supabase/functions/registration-download/index.ts` — service-role token verify + sanitized data fetch.
- **Create** `components/TicketDownload/TicketDownloadPage.tsx` — public page; rebuilds PDFs via existing generator.
- **Modify** `supabase/functions/send-ticket-email/index.ts` — add `registration-confirmed` mode.
- **Modify** `supabase/functions/verify-payment/index.ts` — sign token + send confirmation in each event success path.
- **Modify** `components/PublicRegistration.tsx` — remove client purchaser send; update success screen.
- **Modify** `App.tsx` — register public `/tickets` route.

---

## Task 1: Token helper + unit tests (TDD)

**Files:**
- Create: `supabase/functions/_shared/registrationToken.ts`
- Test: `tests/registrationToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/registrationToken.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  signRegistrationToken,
  verifyRegistrationToken,
} from '../supabase/functions/_shared/registrationToken';

const SECRET = 'test-service-role-key-abc123';
const NOW = 1_750_000_000_000;
const TTL = 180 * 24 * 60 * 60 * 1000;

describe('registrationToken', () => {
  it('round-trips a valid token', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyRegistrationToken(t, SECRET, NOW + 1000);
    expect(r).toEqual({ valid: true, primaryAttendeeId: 'att-1', formId: 'form-9' });
  });

  it('rejects a tampered signature', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const [bodyPart, sig] = t.split('.');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const r = await verifyRegistrationToken(`${bodyPart}.${flipped}`, SECRET, NOW);
    expect(r).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects a forged payload (re-signed body)', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const sig = t.split('.')[1];
    const forgedBody = btoa(JSON.stringify({ a: 'att-EVIL', f: 'form-9', iat: NOW, exp: NOW + TTL }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = await verifyRegistrationToken(`${forgedBody}.${sig}`, SECRET, NOW);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe('bad-signature');
  });

  it('rejects a wrong secret', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, TTL);
    const r = await verifyRegistrationToken(t, 'different-secret', NOW);
    expect(r).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects an expired token', async () => {
    const t = await signRegistrationToken('att-1', 'form-9', SECRET, NOW, 1000);
    const r = await verifyRegistrationToken(t, SECRET, NOW + 2000);
    expect(r).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects malformed input', async () => {
    expect(await verifyRegistrationToken('garbage', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
    expect(await verifyRegistrationToken('', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
    expect(await verifyRegistrationToken('a.b.c', SECRET, NOW)).toEqual({ valid: false, reason: 'malformed' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- registrationToken`
Expected: FAIL — cannot resolve `../supabase/functions/_shared/registrationToken`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/registrationToken.ts`:

```ts
// Stateless HMAC-signed token for the public ticket-download page.
// Pure functions — secret + clock are passed in — so the SAME module is
// importable by the edge function (Deno) AND the vitest suite (node>=18).
// Uses only Web Crypto + btoa/atob/TextEncoder (present in both runtimes).
// No Deno-specific imports may be added to this file.

export interface RegistrationTokenPayload {
  a: string; // primary attendee id
  f: string; // form id
  iat: number; // issued-at (ms epoch)
  exp: number; // expiry (ms epoch)
}

export type VerifyResult =
  | { valid: true; primaryAttendeeId: string; formId: string }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' };

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToString(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64urlEncode(new Uint8Array(sig));
}

// Constant-time string compare (equal-length base64url signatures).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signRegistrationToken(
  primaryAttendeeId: string,
  formId: string,
  secret: string,
  nowMs: number,
  ttlMs: number,
): Promise<string> {
  const payload: RegistrationTokenPayload = {
    a: primaryAttendeeId,
    f: formId,
    iat: nowMs,
    exp: nowMs + ttlMs,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(secret, body);
  return `${body}.${sig}`;
}

export async function verifyRegistrationToken(
  token: string,
  secret: string,
  nowMs: number,
): Promise<VerifyResult> {
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' };
  }
  const [body, sig] = parts;

  let payload: RegistrationTokenPayload;
  try {
    payload = JSON.parse(b64urlDecodeToString(body));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.a !== 'string' || typeof payload.f !== 'string'
      || typeof payload.exp !== 'number') {
    return { valid: false, reason: 'malformed' };
  }

  const expected = await hmacBase64Url(secret, body);
  if (!timingSafeEqual(sig, expected)) {
    return { valid: false, reason: 'bad-signature' };
  }
  if (nowMs > payload.exp) return { valid: false, reason: 'expired' };

  return { valid: true, primaryAttendeeId: payload.a, formId: payload.f };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- registrationToken`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/registrationToken.ts tests/registrationToken.test.ts
git commit -m "feat: add HMAC registration-token helper for ticket download links"
```

---

## Task 2: `registration-download` edge function

**Files:**
- Create: `supabase/functions/registration-download/index.ts`

> Read first: [supabase/functions/send-ticket-email/index.ts:131-210](../../../supabase/functions/send-ticket-email/index.ts) for the createClient + app_settings fetch pattern, and the `corsHeaders` definition at the top of any edge function. Read [services/storageService.ts](../../../services/storageService.ts) to find the app_settings → AppSettings mapper and the attendee row → Attendee mapper (you will reuse these on the page in Task 6, and they tell you which snake_case columns matter here).

- [ ] **Step 1: Write the function**

Create `supabase/functions/registration-download/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyRegistrationToken } from '../_shared/registrationToken.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ALLOW-LIST of app_settings columns safe for the public download page.
// NEVER add smtp_* or any credential. Extend ONLY with PDF/branding columns
// that utils/pdfGenerator.ts actually reads (confirm against storageService
// AppSettings mapper). Keep this an allow-list, never a deny-list.
const SAFE_SETTINGS_KEYS: string[] = [
  'id',
  'email_from_name',
  // --- PDF / branding fields (verify exact names in storageService mapper) ---
  'pdf_logo_url',
  'pdf_primary_color',
  'pdf_accent_color',
  'pdf_event_name',
  'pdf_event_date',
  'pdf_event_location',
  'pdf_footer_text',
  'pdf_show_qr',
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let token = '';
    if (req.method === 'GET') {
      token = new URL(req.url).searchParams.get('token') ?? '';
    } else {
      const reqBody = await req.json().catch(() => ({}));
      token = reqBody.token ?? '';
    }

    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const result = await verifyRegistrationToken(token, secret, Date.now());
    if (!result.valid) return json({ error: 'invalid-token', reason: result.reason }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: primary, error: pErr } = await supabase
      .from('attendees').select('*').eq('id', result.primaryAttendeeId).maybeSingle();
    if (pErr || !primary) return json({ error: 'not-found' }, 404);

    const { data: guests } = await supabase
      .from('attendees').select('*')
      .eq('primary_attendee_id', result.primaryAttendeeId)
      .order('registered_at', { ascending: true });

    const { data: form } = await supabase
      .from('forms').select('*').eq('id', result.formId).maybeSingle();

    const { data: rawSettings } = await supabase
      .from('app_settings').select('*').eq('id', 1).maybeSingle();

    const settings: Record<string, unknown> = {};
    if (rawSettings) {
      for (const k of SAFE_SETTINGS_KEYS) {
        if (k in (rawSettings as Record<string, unknown>)) {
          settings[k] = (rawSettings as Record<string, unknown>)[k];
        }
      }
    }

    return json({ primary, guests: guests ?? [], form, settings });
  } catch (e) {
    return json({ error: 'server-error', detail: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Type-check the repo (edge fn is excluded from tsc, so just ensure no repo break)**

Run: `npx tsc --noEmit`
Expected: PASS (edge functions are not part of the app tsconfig; this confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/registration-download/index.ts
git commit -m "feat: add registration-download edge function (token verify + sanitized fetch)"
```

> Deploy + live smoke happens in Task 7 (batched with the other edge fns).

---

## Task 3: `send-ticket-email` — `registration-confirmed` mode

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts` (add a new `if (body.mode === 'registration-confirmed')` block alongside the other modes, e.g. right after the `group-invite` block ~line 210)

> Read first: [supabase/functions/send-ticket-email/index.ts:160-210](../../../supabase/functions/send-ticket-email/index.ts) (the `group-invite` mode — mirror its structure exactly). Confirm the EXACT app_settings column names for the purchaser templates against [services/storageService.ts](../../../services/storageService.ts) (look for `emailSubject`, `emailBodyTemplate`, `emailTablePurchaserSubject`, `emailTablePurchaserBody` → their snake_case DB columns). Use the names you find; the block below uses the most likely names and MUST be reconciled.

- [ ] **Step 1: Add the mode block**

Insert after the `group-invite` block:

```ts
// ── REGISTRATION CONFIRMED: server-guaranteed purchaser confirmation + download link ──
// No attachments. Reuses the admin purchaser template and appends a download-link
// block. Fired by verify-payment after every event-path insert.
// Body shape: { mode: 'registration-confirmed', primaryAttendeeId, downloadUrl }
if (body.mode === 'registration-confirmed') {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: primary, error: pErr } = await supabase
        .from('attendees').select('*').eq('id', body.primaryAttendeeId).maybeSingle();
    if (pErr || !primary) return jsonResponse({ error: 'Primary not found' }, 404);
    if (!primary.email) return jsonResponse({ ok: true, skipped: 'no-email' });

    const { data: form } = await supabase
        .from('forms').select('title').eq('id', primary.form_id).maybeSingle();
    const eventName = form?.title || 'the event';

    // Table/group purchaser? Pick the table-purchaser template if linked guests exist.
    const { count: guestCount } = await supabase
        .from('attendees').select('id', { count: 'exact', head: true })
        .eq('primary_attendee_id', primary.id);
    const isTableOrGroup = (guestCount ?? 0) > 0;

    const { data: appSettings } = await supabase
        .from('app_settings').select('*').eq('id', 1).maybeSingle();
    const s = (appSettings as any) || {};
    const smtpConfig = appSettings
        ? { host: s.smtp_host, port: Number(s.smtp_port || 587), user: s.smtp_user, pass: s.smtp_pass, fromName: s.email_from_name || 'SCAGO' }
        : undefined;

    // NOTE: reconcile these column names with storageService mapper before deploy.
    const rawSubject = (isTableOrGroup ? s.email_table_purchaser_subject : s.email_subject)
        || s.email_subject || 'Your registration for {{event}} is confirmed';
    const rawBody = (isTableOrGroup ? s.email_table_purchaser_body : s.email_body_template)
        || s.email_body_template || '<p>Thank you for registering for <strong>{{event}}</strong>.</p>';

    const downloadUrl = body.downloadUrl || '';
    const downloadBlock = downloadUrl
        ? `<div style="margin-top:20px;padding:16px 18px;background:#f0f7ff;border-left:3px solid #1E4A8C;border-radius:6px;">
             <p style="margin:0 0 10px;font-weight:600;">Your tickets</p>
             <p style="margin:0 0 12px;font-size:14px;color:#475569;">Download your ticket(s) — including any guests — using the button below. Keep this email; the link stays valid through the event.</p>
             <p style="text-align:center;margin:8px 0;"><a href="${downloadUrl}" style="display:inline-block;padding:12px 24px;background:#1E4A8C;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Download your tickets</a></p>
           </div>`
        : '';

    const replace = (str: string) => str
        .replace(/\{\{event\}\}/g, eventName)
        .replace(/\{\{name\}\}/g, primary.name || '')
        .replace(/\{\{id\}\}/g, primary.id || '')
        .replace(/\{\{invoiceId\}\}/g, primary.invoice_id || '')
        .replace(/\{\{amount\}\}/g, primary.payment_amount || '')
        .replace(/\{\{download_url\}\}/g, downloadUrl);

    const subject = replace(rawSubject);
    const contentHtml = replace(rawBody) + downloadBlock;
    const html = generateEmailTemplate({
        title: eventName,
        greeting: `Hi ${primary.name || 'there'}`,
        content: contentHtml,
        fromName: smtpConfig?.fromName,
    });

    await sendSimpleEmail({ to: primary.email, subject, html, smtpConfig });

    // Stamp send time (best-effort; rowcount not critical for a metadata stamp).
    await supabase.from('attendees')
        .update({ last_ticket_email_at: new Date().toISOString() })
        .eq('id', primary.id);

    return jsonResponse({ ok: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no app-side change).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-ticket-email/index.ts
git commit -m "feat: add registration-confirmed mode to send-ticket-email"
```

---

## Task 4: `verify-payment` — sign token + send confirmation in each event path

**Files:**
- Modify: `supabase/functions/verify-payment/index.ts`

> Read first: the file's import block (top), the existing server-side send (`group-invite` POST ~line 1471-1496), and the FOUR event success points where a primary row id is available after insert:
> - Free branch
> - Static-pricing event branch (after PayPal capture + insert, ~line 1935+)
> - Dynamic single branch (after insert, ~line 1576-1615)
> - Dynamic group branch (after insert, ~line 1327-1496; primary id is the group's primary)
> Each branch already returns a success response containing the inserted primary id — locate that id variable per branch.

- [ ] **Step 1: Add the import**

At the top of the file, alongside other imports:

```ts
import { signRegistrationToken } from '../_shared/registrationToken.ts';
```

- [ ] **Step 2: Add a shared helper near the top of the module (after the existing helpers, before `serve`)**

```ts
// Sends the server-guaranteed purchaser confirmation email with a signed
// ticket-download link. Best-effort: logs and swallows errors so a registration
// is NEVER failed by an email hiccup. Call after a successful event-path insert.
async function sendRegistrationConfirmedEmail(
  primaryAttendeeId: string,
  formId: string,
  origin: string,
): Promise<void> {
  try {
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
    const token = await signRegistrationToken(primaryAttendeeId, formId, secret, Date.now(), TTL_MS);
    const downloadUrl = `${origin}/#/tickets?token=${encodeURIComponent(token)}`;
    const emailFnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-ticket-email`;
    const resp = await fetch(emailFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ mode: 'registration-confirmed', primaryAttendeeId, downloadUrl }),
    });
    if (!resp.ok) {
      console.error('[verify-payment] registration-confirmed email failed', resp.status, await resp.text());
    }
  } catch (e) {
    console.error('[verify-payment] registration-confirmed email threw', String(e));
  }
}
```

- [ ] **Step 3: Call it in each event success path**

In EACH of the four branches (free, static, dynamic-single, dynamic-group), immediately after the primary row insert succeeds and before building the success `Response`, add (substituting that branch's actual primary-id and form-id variables):

```ts
await sendRegistrationConfirmedEmail(<primaryIdVar>, <formIdVar>, req.headers.get('origin') ?? '');
```

For the dynamic-group branch, this is the GROUP PRIMARY's id (the same row the per-guest `group-invite` sends reference). Do NOT send one per guest — exactly one purchaser email per registration.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/verify-payment/index.ts
git commit -m "feat: verify-payment sends server-guaranteed purchaser email + download link"
```

---

## Task 5: `PublicRegistration` — remove client purchaser send; keep guest sends; update success screen

**Files:**
- Modify: `components/PublicRegistration.tsx`

> Read first: [components/PublicRegistration.tsx:1488-1600](../../../components/PublicRegistration.tsx) (the purchaser send block + per-guest loops) and the success-screen render that uses `emailDispatched` (search `emailDispatched`).

- [ ] **Step 1: Remove the purchaser email send**

Delete the purchaser send block — from the `await sendTicketEmail(settings, { to: purchaserEmail, … attachments })` call through its `lastTicketEmailAt` stamp (the block spanning roughly lines 1503–1521, ending just before the `// Group-mode: send each inline registrant…` comment). Keep `setEmailDispatched(true)` removed here (the server owns the purchaser email now).

KEEP intact:
- the per-guest inline sends (`for (const g of groupGuestPdfs)` loop), and
- the named-guest sends (`for (let idx = 0; idx < guestTickets.length; idx++)` loop).

These remain best-effort client enhancements.

- [ ] **Step 2: Update the success screen copy**

Where the success screen currently branches on `emailDispatched` (the amber "save/download your tickets now" notice), replace the messaging so it ALWAYS tells the buyer: a confirmation email with a secure link to download their tickets has been sent, AND still offers the existing immediate in-browser download of the PDFs the client already generated. Concretely: keep the download affordance unconditional; change the notice text to:

> "We've emailed your confirmation with a secure link to download your tickets. You can also download them right now below."

If `emailDispatched` state is now unused after Step 1, remove the unused state declaration to keep `tsc` clean.

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/PublicRegistration.tsx
git commit -m "refactor: drop client purchaser email; server now owns it (keep guest sends)"
```

---

## Task 6: Public `/#/tickets` download page + route

**Files:**
- Create: `components/TicketDownload/TicketDownloadPage.tsx`
- Modify: `App.tsx`

> Read first: [utils/pdfGenerator.ts](../../../utils/pdfGenerator.ts) — note the exact `generateTicketPDF(attendee, settings, form, registrationUrl?)` signature and which `AppSettings`/`Form`/`Attendee` fields it reads. Read [services/storageService.ts](../../../services/storageService.ts) for the row→`Attendee` and settings→`AppSettings` mappers (reuse them; if not exported, export them or replicate the minimal mapping). Read [App.tsx](../../../App.tsx) for how public routes (e.g. `/form/:formId`) are registered OUTSIDE `ProtectedRoute`.

- [ ] **Step 1: Create the page**

Create `components/TicketDownload/TicketDownloadPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { generateTicketPDF } from '../../utils/pdfGenerator';
// Reuse existing mappers — adjust the import names to what storageService exports.
// If these are not exported, export them there (preferred) or inline a minimal map.
import { mapRowToAttendee, mapRowToAppSettings, mapRowToForm } from '../../services/storageService';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; reason: string }
  | { phase: 'ready'; tickets: { id: string; name: string }[] };

function getTokenFromHash(): string {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const qIdx = hash.indexOf('?');
  if (qIdx === -1) return '';
  return new URLSearchParams(hash.slice(qIdx + 1)).get('token') ?? '';
}

export function TicketDownloadPage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  // Hold rebuilt jsPDF docs keyed by attendee id for download-on-click.
  const [docs, setDocs] = useState<Record<string, any>>({});

  useEffect(() => {
    (async () => {
      const token = getTokenFromHash();
      if (!token) { setState({ phase: 'error', reason: 'missing' }); return; }

      const { data, error } = await supabase.functions.invoke('registration-download', {
        body: { token },
      });
      if (error || !data || data.error) {
        const reason = (data && data.reason) || (error ? 'server' : 'invalid');
        setState({ phase: 'error', reason });
        return;
      }

      const settings = mapRowToAppSettings(data.settings);
      const form = data.form ? mapRowToForm(data.form) : undefined;
      const rows = [data.primary, ...(data.guests || [])];
      const builtDocs: Record<string, any> = {};
      const tickets: { id: string; name: string }[] = [];
      for (const row of rows) {
        const attendee = mapRowToAttendee(row);
        const doc = await generateTicketPDF(attendee, settings, form);
        builtDocs[attendee.id] = doc;
        tickets.push({ id: attendee.id, name: attendee.name || 'Ticket' });
      }
      setDocs(builtDocs);
      setState({ phase: 'ready', tickets });
    })();
  }, []);

  const download = (id: string, name: string) => {
    const doc = docs[id];
    if (doc) doc.save(`${(name || 'Ticket').replace(/[^a-zA-Z0-9 ]/g, '_')}_Ticket.pdf`);
  };

  if (state.phase === 'loading') {
    return <div style={{ maxWidth: 560, margin: '64px auto', textAlign: 'center', fontFamily: 'system-ui' }}>Loading your tickets…</div>;
  }
  if (state.phase === 'error') {
    const msg = state.reason === 'expired'
      ? 'This download link has expired. Please contact the organizer to re-send your tickets.'
      : 'We couldn’t load these tickets. The link may be invalid — please contact the organizer.';
    return <div style={{ maxWidth: 560, margin: '64px auto', textAlign: 'center', fontFamily: 'system-ui' }}>{msg}</div>;
  }
  return (
    <div style={{ maxWidth: 560, margin: '48px auto', fontFamily: 'system-ui', padding: 16 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Your tickets</h1>
      <button onClick={() => state.tickets.forEach(t => download(t.id, t.name))}
        style={{ marginBottom: 16, padding: '10px 18px', background: '#1E4A8C', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600 }}>
        Download all ({state.tickets.length})
      </button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {state.tickets.map(t => (
          <li key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eee' }}>
            <span>{t.name}</span>
            <button onClick={() => download(t.id, t.name)} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #1E4A8C', color: '#1E4A8C', borderRadius: 6, fontWeight: 600 }}>Download</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> NOTE: Map function names (`mapRowToAttendee`, `mapRowToAppSettings`, `mapRowToForm`) MUST match storageService's real exports — reconcile during implementation.

- [ ] **Step 2: Register the public route in App.tsx**

Add an import and a public route (place it with the other public routes like `/form/:formId`, NOT inside `ProtectedRoute`):

```tsx
import { TicketDownloadPage } from './components/TicketDownload/TicketDownloadPage';
// …
<Route path="/tickets" element={<TicketDownloadPage />} />
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. (If mapper exports differ, fix imports until green.)

- [ ] **Step 4: Verify in browser (preview workflow)**

Start the dev server, navigate to `/#/tickets?token=BADTOKEN`, confirm the friendly error renders (not a crash). A full happy-path test requires a real token — covered by the end-to-end smoke in Task 7.

- [ ] **Step 5: Commit**

```bash
git add components/TicketDownload/TicketDownloadPage.tsx App.tsx
git commit -m "feat: public ticket-download page at /#/tickets"
```

---

## Task 7: Verify, audit, deploy to both tenants

- [ ] **Step 1: Full verification**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all green, including the new `registrationToken` tests.

- [ ] **Step 2: Cold-context audit (rule #6)**

Dispatch a fresh subagent to audit the integration end-to-end against the spec, specifically: (a) token signed in verify-payment matches what registration-download verifies (same payload shape + secret env var), (b) `registration-confirmed` reads the correct app_settings column names, (c) `SAFE_SETTINGS_KEYS` covers every field `generateTicketPDF` reads AND leaks no SMTP field, (d) the four event branches each call `sendRegistrationConfirmedEmail` exactly once with the right primary/form ids. Fix anything it finds.

- [ ] **Step 3: Deploy edge functions to BOTH projects (CLI `--use-api`)**

```bash
# new function first, then the two modified ones
npx --yes supabase functions deploy registration-download --project-ref iigbgbgakevcgilucvbs --use-api
npx --yes supabase functions deploy registration-download --project-ref gticuvgclbvhwvpzkuez --use-api
npx --yes supabase functions deploy send-ticket-email     --project-ref iigbgbgakevcgilucvbs --use-api
npx --yes supabase functions deploy send-ticket-email     --project-ref gticuvgclbvhwvpzkuez --use-api
npx --yes supabase functions deploy verify-payment        --project-ref iigbgbgakevcgilucvbs --use-api
npx --yes supabase functions deploy verify-payment        --project-ref gticuvgclbvhwvpzkuez --use-api
```

- [ ] **Step 4: Smoke each function on both refs**

```bash
# verify-payment (real function guard)
curl -s -X POST "https://<ref>.supabase.co/functions/v1/verify-payment" \
  -H "Content-Type: application/json" -d '{"mode":"paid"}'
# Expect: {"error":"Missing required field: attendees"}

# registration-download (bad token → 400)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<ref>.supabase.co/functions/v1/registration-download" \
  -H "Content-Type: application/json" -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" -d '{"token":"garbage"}'
# Expect: 400
```

- [ ] **Step 5: End-to-end smoke**

Do one real test registration (`is_test`) on a dynamic GANSID form and one on a static SCAGO form. Confirm: purchaser receives the confirmation email, the link opens `/#/tickets`, and the ticket PDF(s) download. Then delete the test rows.

- [ ] **Step 6: Update CLAUDE.md (rule #11)**

Bump the date stamp; add a §19 entry (2026-06-26 — server-guaranteed purchaser email + tokenized ticket download); update §11 (new `registration-download` fn; `send-ticket-email` new mode; `verify-payment` now sends purchaser confirmation), §18 (the client-only-email gotcha is now resolved for the purchaser path — note it), and the deploy notes.

- [ ] **Step 7: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: record server-guaranteed ticket email + download page (P4)"
```

---

## Notes / risks the implementer must resolve

1. **app_settings column names** — Task 3's template columns and Task 2's `SAFE_SETTINGS_KEYS` are best-guess snake_case. Reconcile against `services/storageService.ts` mappers before deploy. Missing a PDF field → blank/wrong PDFs; including an SMTP field → credential leak. Treat the allow-list as security-critical.
2. **storageService mapper exports** — Task 6 assumes `mapRowToAttendee` / `mapRowToAppSettings` / `mapRowToForm`. Use the real export names (or export them).
3. **`generateTicketPDF` async-ness** — it may be sync (returns a jsPDF) or async. Adjust the `await` in Task 6 accordingly.
4. **JWT on the edge function** — `supabase.functions.invoke` sends the anon JWT automatically, so `registration-download` does NOT need `--no-verify-jwt`. If you ever switch to a raw `fetch`, you must add the `apikey` + `Authorization: Bearer <anon>` headers (see Task 7 curl).
