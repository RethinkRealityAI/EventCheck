# Bulk Contacts upgrade — free invite-to-register + tagging + modal UX

> Spec date: 2026-06-26
> Status: approved (design), pending implementation plan
> Tenants: BOTH (SCAGO `iigbgbgakevcgilucvbs`, GANSID `gticuvgclbvhwvpzkuez`)
> Builds on: the bulk contact import feature (`imported_contacts` / `contact_import_batches`, Contacts tab, BulkImportModal) and the P4 `registrationToken` HMAC helper, both shipped 2026-06-26.

## Problem

The bulk import is a pure mailing-list blast: an admin-composed `raw-html` email with per-recipient placeholders + open/click tracking. It cannot invite a contact to **register**, it sends no registration/ticket/login link, and `imported_contacts` are deliberately separate from `attendees` (no `user_id`, no portal access). The admin wants to:

1. Email imported contacts a link to complete a **free** registration (they're "already part of the platform") — fill the non-payment parts (name, email, dietary, consents) and optionally **set a password and log in**.
2. **Tag/group** contacts (e.g. by organization), **filter** by tag, **multi-select**, and **resend** to everyone or a specific group.
3. A **better-looking, better-functioning** import/compose modal.

## Decisions (locked during brainstorm)

1. **Always free** — invited contacts register with no payment step.
2. **Create-on-completion, not pre-create** — do NOT pre-create attendee rows for everyone emailed (mailing lists are large; most never register). The attendee row is created only when the contact completes the form. `imported_contacts` tracks invited→registered.
3. **Signed invite token** — the invite link carries an HMAC token (reusing the P4 `registrationToken` helper, extended with a `kind` field) encoding `{contactId, formId, exp}`. The **free designation is server-validated** via the token — never client-claimed (same discipline as P4).
4. **Admin picks the target form per send** (defaults to the active event).
5. **Multiple tags per contact** (`tags text[]`) with a type-to-create dropdown of existing tags.
6. **Audience-picker = Contacts tab list; composer = modal.** Tagging, filtering, and multi-select live in the Contacts tab; the modal composes/sends.
7. **Portal login optional but prominent** on the registration success screen (reuses the existing claim-flow signup).

## Architecture

Three separable units that ship together: (A) data model, (B) the free invite flow, (C) tagging/filtering/resend + modal UX.

### A. Data model — one migration (both tenants)

`imported_contacts` gains:
- `tags text[] NOT NULL DEFAULT '{}'` — multi-tag. GIN index `imported_contacts_tags_idx`. Backfill: `UPDATE ... SET tags = ARRAY[tag] WHERE tag IS NOT NULL AND tag <> ''` (keep the legacy single `tag` column for batch provenance).
- `attendee_id uuid REFERENCES attendees(id) ON DELETE SET NULL` — set when the contact completes the free registration.
- `registered_at timestamptz` — completion timestamp (powers the invited/registered filter + conversion count).

No RLS change: the existing `imported_contacts_admin_all` `FOR ALL USING(is_portal_admin())` policy already covers new columns. Migration is additive/idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Filename `20260627000000_bulk_contacts_tags_and_registration.sql` (must sort after the existing `20260626000000`).

### B. Free "invite to register" flow

**Token** — extend `supabase/functions/_shared/registrationToken.ts` with an optional `kind` field in the payload (`'download'` default for P4, `'invite'` for this feature) so the two token types can't be cross-used. Add `signInviteToken(contactId, formId, secret, nowMs, ttlMs)` + `verifyInviteToken(token, secret, nowMs)` (or a generic `kind` param). TTL e.g. 60 days. Unit-tested.

**Two new edge functions** (clean separation; correct per-function `verify_jwt`):

- `contact-invite-send` — **admin-only** (`config.toml` `verify_jwt = true`; the function additionally asserts `is_portal_admin()` from the JWT). Action per call: `{ contactId, formId, origin, subject, html? }` → signs an invite token, builds `${origin}/#/form/${formId}?invite=<token>`, sends the invite email (new `send-ticket-email` mode `contact-register-invite`, admin-editable template, with `{{registration_link}}` + existing placeholders), stamps `imported_contacts.email_status='sent'` + `tracking_id`. The client (modal) loops over selected contacts with the existing throttle/`claimContactForSend` batching, calling this per recipient — preserving live progress.
- `contact-invite-claim` — **public, token-gated** (`config.toml` `verify_jwt = false`; the token IS the credential). CORS allow-list includes `x-supabase-client-platform` + `x-supabase-api-version`. Actions:
  - `resolve { token }` → verify token → `{ contactName, contactEmail, formId }` for prefill (no PII in the URL).
  - `register { token, answers, name, email }` → verify token; reject if the contact already has `attendee_id` (one free reg per invite); insert a free attendee (service-role) with `payment_status='free'`, **`payment_method=null`** (the `attendees_payment_method_check` constraint allows only `{card,paypal,cheque,external,promo,bogo}`+NULL — a label like `'comp'` would 500 like the 2026-06-12 BOGO incident; `payment_status='free'` + the `attendee_id` link already mark these rows), `qr_payload=JSON.stringify({id})`, `form_id`, `answers`, `name`/`email`; set `imported_contacts.attendee_id` + `registered_at`; fire the P4 `registration-confirmed` email (reuse). Returns the attendee id.

**Form (`PublicRegistration.tsx`)** — detect `?invite=<token>` (alongside the existing `?ref=`). On load call `contact-invite-claim/resolve` → prefill the form's name/email fields + set a **free invited mode** that hides the payment step. On submit, post answers + token to `contact-invite-claim/register` (instead of `verify-payment`), then show success. Reuse the existing **optional portal signup** block (set password → `supabase.auth.signUp` → `link_attendees_to_new_user` trigger backfills `user_id`) — made prominent.

**Security:** token is non-enumerable + scoped to one contact+form; `register` re-validates server-side and is idempotent (already-registered → rejected); free status is server-trusted; no SMTP/secret ever returned by `resolve`.

### C. Tagging, filtering, multi-select resend + modal UX

**Contacts tab (`ImportedContactsTab.tsx`) — the audience picker:**
- **Tags column** rendering chips; inline add/remove via a type-to-create dropdown listing existing distinct tags.
- **Filter bar:** multi-select **tag** dropdown, **status** filter (sent / failed / pending / **registered**), text search.
- **Checkbox multi-select** per row + "select all in current filter."
- **Bulk action bar** on selection: **Send registration invite** (opens modal in invite mode, pre-targeted to the selection) · **Resend campaign** · **Add tag / Remove tag** · **Delete**.
- "Resend to everyone or a group" = filter by tag(s) → select all → action.

**Service (`importedContactsService.ts`):** add `addTags(ids, tags)`, `removeTag(ids, tag)`, `listDistinctTags()`, filter params (`tags?`, `registered?`), and a `markContactRegistered(contactId, attendeeId)` helper (used by the edge fn via service-role, mirrored client-side for reads).

**Modal (`BulkImportModal.tsx`) — the composer, UX refresh:**
- Restructured steps: **Audience → Compose → Review & Send → Live progress**, with an Audience summary (count, active filters/tags).
- **Two modes:** *Campaign* (today's free-form email) and *Registration invite* (free invite: a **form picker** + the `{{registration_link}}` auto-injected; calls `contact-invite-send` per recipient).
- **Import step** polish: clearer CSV column mapping, **assign tags at import time**, basic dedupe-by-email (skip rows whose email already exists in the batch/list).
- Visual polish consistent with the app, responsive, `createPortal` to `document.body` (rule #7), accessible labels/focus.

## Out of scope (YAGNI — revisit later)

Conversion-analytics dashboards, unsubscribe/opt-out flags, **paid** invites, group/multi-person invites under one purchaser, per-field read-only locking. Not built now.

## Testing & deploy

- Unit tests: invite-token sign/verify (round-trip, tamper, wrong secret, expired, wrong `kind`), and any pure tag-filter/dedupe helpers. `npm test` + `npx tsc --noEmit` + `npm run build` green (rule #14).
- One migration → `lint:migrations` before; `smoke:db` + `check:migrations` after (rule #12). Apply SCAGO via MCP, GANSID via CLI.
- Edge fns (`contact-invite-send`, `contact-invite-claim`, `send-ticket-email`) deployed to BOTH via CLI `--use-api`; smoke each.
- Cold-context audit after implementation (rule #6).
- Verify on deploy previews before merging to prod; coordinated release (frontend + edge together) like P4.

## Files (anticipated)

- **Create:** `supabase/migrations/20260627000000_bulk_contacts_tags_and_registration.sql`; `supabase/functions/contact-invite-send/index.ts`; `supabase/functions/contact-invite-claim/index.ts`; `tests/inviteToken.test.ts` (+ tag-helper tests).
- **Modify:** `supabase/functions/_shared/registrationToken.ts` (kind field); `supabase/functions/send-ticket-email/index.ts` (`contact-register-invite` mode); `supabase/config.toml` (two new fn stanzas); `components/PublicRegistration.tsx` (`?invite=` path); `components/Contacts/ImportedContactsTab.tsx` (tags/filter/multi-select/bulk bar); `services/importedContactsService.ts` (tag + filter + mark-registered); `components/BulkImport/BulkImportModal.tsx` (UX refresh + invite mode).
