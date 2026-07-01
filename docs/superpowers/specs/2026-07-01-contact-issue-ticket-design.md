# Contact "Issue Ticket" — Design

**Date:** 2026-07-01
**Status:** Design approved.
**Tenant:** GANSID (the target free-registration form is GANSID data; edge fn deployed to both).

## Problem
Admins want to give a contact a **free event ticket directly** — bulk or individual, from the Contacts tab — WITHOUT the contact clicking an invite link and completing the registration form. Today the only free path is the invite link (contact must click + fill the form + accept consents).

## Approved decisions
- Target form: **`gansid-congress-2026-invite`** (the free-registration form).
- Ticket label: **`ticket_type = 'Issued (free)'`** (distinct from invite-completed `'Invited (free)'`).
- **Consents skipped** — admin-issued comp; no consent capture.

## Design

### Backend — new admin-gated edge function `contact-issue-ticket`
Called by the client **per contact** (with the campaign throttle). Per contact:
1. **Admin gate** — createClient with the caller's `Authorization` header → `auth.getUser()` → service-role query `profiles.role IN (admin, super_admin)`. Mirrors `contact-invite-send` exactly. 401/403 otherwise.
2. Load the contact (`email`, `name`) by id (service role). 404 if missing; skip with error if no email.
3. **Idempotency:** if the contact already has a linked `attendee_id`, OR a non-test attendee already exists for this `email` + `form_id`, **RESEND** that ticket (no new row) → `{ ok, attendeeId, resent: true }`.
4. Else **insert a free attendee** (rowcount-checked): `id = crypto.randomUUID()`, `form_id`, `name`, `email`, `ticket_type: 'Issued (free)'`, `payment_status: 'free'`, `payment_method: null`, `is_primary: true`, `registered_at: now()`, `qr_payload: JSON.stringify({ id })`, `answers: {}`.
5. **Link the contact:** `update imported_contacts set attendee_id = <id>, registered_at = now() where id = contactId` (so it appears in the registration dashboard + shows **Registered** in Contacts). Rowcount-checked.
6. **Send the P4 confirmation email:** sign a 180-day download token **in-runtime** with `signRegistrationToken(attendeeId, formId, SUPABASE_SERVICE_ROLE_KEY, Date.now(), 180d)` (valid because minted inside the runtime — same secret `registration-download` verifies); `downloadUrl = ${origin || PUBLIC_SITE_URL}/#/tickets?token=<t>`; POST `send-ticket-email` mode `registration-confirmed` `{ primaryAttendeeId: attendeeId, downloadUrl }`. **Best-effort** — an email failure does NOT fail the issue (return `{ ok, attendeeId, emailSent: false }`).
7. Return `{ ok: true, attendeeId, resent, emailSent }`.

- CORS allow-list includes `x-supabase-client-platform` + `x-supabase-api-version`. **`verify_jwt = true`** (needs the admin JWT) — add a `config.toml` entry.
- Env used (all already set): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PUBLIC_SITE_URL`.
- Reuse `_shared/registrationToken.ts` (`signRegistrationToken`). A small pure `buildIssuedAttendeeRow(contact, formId)` helper builds the insert shape (unit-tested per §16 #14). Does NOT touch the working `contact-invite-claim` (keeps risk local).

### Frontend — Contacts tab
- Add **`purpose: 'issue-ticket'`** to `BulkImportModal` (sibling to `'invite'`/`'campaign'`), reusing its throttled send queue (50/30s) + per-contact progress.
- The Contacts bulk-action bar gets a **"Send ticket"** button (and the single-select case = per-row send) that opens the modal in issue-ticket mode with the selected contacts.
- issue-ticket **compose = a form picker** (default `gansid-congress-2026-invite`) + a static confirmation note ("Each of these N contacts gets a free ticket for *<form title>*, emailed with a secure download link — no form to fill"). **No email editor** (the ticket email is the fixed P4 template).
- Send loop: for each contact, `supabase.functions.invoke('contact-issue-ticket', { body: { contactId, formId, origin: window.location.origin } })`; map result to the row status (sent / **resent** / failed). Decoupled from `email_status` (writes `attendee_id`/`registered_at`, like invites).

### Errors / edge cases
- Already-registered → resend (surfaced as "resent", no dupe).
- No email → skipped with an error row.
- Non-admin caller → 403 (the button is admin-only UI anyway).

## Data / schema
**No schema changes, no new columns.** `attendees` + `imported_contacts` already hold everything.

## Testing
- **Unit (§16 #14):** `buildIssuedAttendeeRow` + the dedup decision helper — vitest.
- **Manual (preview, admin session):** issue to a test contact → an `'Issued (free)'` attendee appears in the Live tab + the contact flips to **Registered** + the P4 email arrives with a working `/#/tickets` link. Bulk of 2–3. Re-issue an already-registered contact → "resent", no duplicate.
- `npx tsc --noEmit` + `npm test` + `npm run build` clean.

## Rollout
- Deploy `contact-issue-ticket` to BOTH tenants via CLI `--use-api`.
- Frontend → `main` → Netlify. No migration; `smoke:db` after.

## Non-goals
No new email template (reuse P4 `registration-confirmed`). No consent capture. No change to the invite/claim flow. No refactor of `contact-invite-claim`.
