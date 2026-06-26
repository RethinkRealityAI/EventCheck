# Server-guaranteed purchaser email + tokenized ticket download (P4)

> Spec date: 2026-06-26
> Status: approved (design), pending implementation plan
> Tenants affected: BOTH (SCAGO `iigbgbgakevcgilucvbs`, GANSID `gticuvgclbvhwvpzkuez`)

## Problem

The buyer's ticket-confirmation email is **client-only and fragile**. After
`verify-payment` inserts attendee rows, the browser ([PublicRegistration.tsx](../../../components/PublicRegistration.tsx)
~1503) generates every ticket PDF with jsPDF and sends the purchaser + per-guest
emails. All client email errors are swallowed (registration still shows
"success"). Failure modes:

- Tab closed right after PayPal → **no email at all**.
- SMTP missing/blocked client-side → silent failure.
- Large multi-table order (Hope Gala `maxPerOrder:5` × `seats:8` = up to 40
  PDFs in one email) → provider body-size rejection.

Detection: dashboard "Sent" / `lastTicketEmailAt` stays blank. On SCAGO there is
**no portal**, so the email is the *only* ticket delivery — an empty-handed buyer
has nothing.

Root constraint: **ticket PDFs are generated in the browser** (jsPDF + QR).
`send-ticket-email` only *relays* base64 PDFs handed to it; it cannot generate
them. That is why the send is client-side today.

## Goal

Guarantee that **every successful event registration results in a purchaser
email the buyer can act on, independent of whether the browser tab survives** —
without porting PDF generation to the server, and without making the 40-PDF
attachment problem worse.

## Decisions (locked during brainstorm)

1. **Approach A** — server-side safety-net email + tokenized download page (not
   server-side PDF generation, not client-PDF-relay).
2. **A2 link mechanism** — opaque HMAC-signed token validated by a new
   service-role edge function. Tenant-agnostic, non-enumerable, does not rely on
   (or widen) the existing anon-read RLS exposure.
3. **Email behavior: replace purchaser email, keep guest sends** — the server
   sends the ONE purchaser email (confirmation + download-all link, no
   attachments); the client stops sending its own purchaser email (no
   duplicate) but still emails each guest their individual PDF when the tab is
   open.
4. **Scope: all event registration paths** — free, static-ticket, dynamic-single,
   dynamic-group. Sponsor/exhibitor/cheque flows untouched.
5. **HMAC secret = existing `SUPABASE_SERVICE_ROLE_KEY`** — no new env var on
   either project. Tradeoff: rotating the service key invalidates outstanding
   ticket links (rare; links are re-sendable). **TTL = 180 days.**
6. **No DB migration** — token is stateless HMAC (no storage); the confirmation
   email reuses existing `app_settings` templates (no new columns).

## Architecture

Four pieces.

### 1. Shared token helper — `supabase/functions/_shared/registrationToken.ts`

Pure functions (secret + clock passed in, so they are unit-testable in
node/vitest via `globalThis.crypto`):

- `signRegistrationToken(primaryAttendeeId, formId, secret, nowMs, ttlMs)` →
  `base64url(JSON payload) + "." + base64url(HMAC-SHA256)`. Payload:
  `{ a: primaryAttendeeId, f: formId, iat, exp }`.
- `verifyRegistrationToken(token, secret, nowMs)` →
  `{ valid: true, primaryAttendeeId, formId }` or
  `{ valid: false, reason: 'malformed' | 'bad-signature' | 'expired' }`.
- Constant-time signature comparison.

Uses Web Crypto `crypto.subtle` (present in Deno and in node ≥ 18 as
`globalThis.crypto`), so the same file is importable by both the edge function
and the vitest suite.

### 2. New edge function — `supabase/functions/registration-download/`

- `POST { token }` (also accept `GET ?token=` for convenience).
- Verify token via the shared helper keyed by `SUPABASE_SERVICE_ROLE_KEY`.
  Invalid/expired → `400 { error, reason }`.
- Service-role fetch:
  - primary attendee (`id = primaryAttendeeId`) + linked guests
    (`primary_attendee_id = primaryAttendeeId`),
  - the form (`id = formId`),
  - **sanitized** settings: only PDF/branding fields. Explicitly **strip
    `smtp_pass` and every SMTP credential** — an allow-list of returned keys, not
    a deny-list.
- Returns `{ primary, guests, form, settings }` as JSON.
- CORS allow-list **must** include `x-supabase-client-platform` and
  `x-supabase-api-version` (else supabase-js v2.45+ preflight is blocked).

### 3. New public page + route — `/#/tickets?token=…`

`components/TicketDownload/TicketDownloadPage.tsx`:

- Reads `token` from the hash query (reuse the `getHashAuthSearchParams` shape
  or a small local parse — HashRouter puts params in `location.hash`).
- Calls `registration-download`; on success rebuilds every ticket PDF in-browser
  by **reusing existing [`generateTicketPDF`](../../../utils/pdfGenerator.ts) +
  [`resolveAttendeeDisplayName`](../../../utils/resolveAttendeeDisplayName.ts)**.
- One card per ticket with a Download button + a "Download all" action.
- No auth. States: loading, ready (list), error (`expired` → "This link has
  expired — contact the organizer to re-send"; other → generic).
- Route registered as **public** in [App.tsx](../../../App.tsx) (NOT behind
  `ProtectedRoute`).

### 4. `verify-payment` + `send-ticket-email` changes

`verify-payment` (already sends server-side email — fires `group-invite` via
`send-ticket-email` with the service-role key, so the plumbing exists):

- In each **event** success path (free, static, dynamic-single, dynamic-group),
  after the insert returns the primary id:
  1. `signRegistrationToken(primaryId, formId, SERVICE_ROLE_KEY, Date.now(), 180d)`.
  2. Build `${origin}/#/tickets?token=…` (`origin` from `req.headers.get('origin')`).
  3. `POST send-ticket-email { mode: 'registration-confirmed', … }` with the
     link. **Best-effort**: wrap in try/catch, log on failure, never fail the
     registration. Stamp `last_ticket_email_at` on the primary on success.
- Sponsor/exhibitor/cheque branches unchanged.

`send-ticket-email` — new mode `registration-confirmed`:

- No attachments. Reuses the admin's existing purchaser template from
  `app_settings` (`emailTablePurchaserSubject/Body` for table/group, else
  `emailSubject/Body`) so branding/copy stay consistent, then appends a
  download-link block (mirrors the existing claim-links block pattern).
- Placeholders: `{{name}}`, `{{event}}`, `{{id}}`, `{{invoiceId}}`, `{{amount}}`,
  `{{download_url}}`.

`PublicRegistration.tsx`:

- **Remove** the purchaser email send block (~1503–1521) — the server owns it now.
- **Keep** the per-guest sends (~1528–1598, best-effort).
- Success screen: always offer an immediate in-browser "Download tickets" using
  the PDFs the client already generated, and tell the buyer a confirmation +
  download link was emailed. (Supersedes the current `emailDispatched` amber
  notice — the buyer is never empty-handed even if server SMTP hiccups.)

## Data flow

```
PayPal capture → verify-payment inserts rows
  → sign token → send-ticket-email(registration-confirmed) → purchaser inbox   [GUARANTEED, survives tab close]
Client (tab open): emails each GUEST their individual PDF (best-effort)
                   no longer sends its own purchaser email (server owns it)
Purchaser clicks link → /#/tickets?token → registration-download (verify + fetch)
  → page rebuilds all PDFs with existing generateTicketPDF → download
```

## Error handling

- Server email failure → logged, registration still succeeds; success screen's
  in-browser download covers the buyer.
- Bad/expired token → friendly page copy, no crash.
- `registration-download` returns sanitized settings only → **no SMTP secret
  reaches the public page** (allow-list enforced + asserted in code review).

## Security notes

- Token is non-enumerable (HMAC) and scoped to one registration.
- Settings allow-list, not deny-list — new app_settings columns can't leak by
  default.
- Does not change existing RLS. (The pre-existing GANSID anon-read wildcard is
  out of scope here and unchanged.)

## Testing & deploy

- **New** `tests/registrationToken.test.ts`: sign→verify round-trip, tampered
  signature → `bad-signature`, wrong secret → `bad-signature`, past `exp` →
  `expired`, malformed input → `malformed`, payload field extraction. Required
  green before deploy (rule #14).
- `npm test`, `npx tsc --noEmit`, `npm run build` all green.
- No migration → `lint:migrations` / `smoke:db` / `check:migrations` not
  required for this change.
- Cold-context audit after implementation (rule #6).
- Deploy via CLI `--use-api` to **both** projects, in this order:
  `registration-download` (new), `send-ticket-email`, `verify-payment`.
  Smoke each: `verify-payment` → `{"error":"Missing required field: attendees"}`;
  `registration-download` → `400` on a bogus token.

## Out of scope (explicitly)

- Server-side PDF generation.
- Per-guest server-side download links (guest direct emails stay client-side
  best-effort).
- Sponsor / exhibitor / cheque confirmation flows.
- The pre-existing GANSID anon-read RLS wildcard (tracked separately).
- Auth/confirmation/reset email deliverability (the IONOS→Resend work; separate).
