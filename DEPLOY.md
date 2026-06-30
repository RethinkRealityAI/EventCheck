# Deployment instructions

These steps must be run **before** the application code is deployed (the new
TypeScript code expects these columns to exist). Once both are done, the
features in PRs #10 and #11 will work end-to-end.

The runbook covers two things:

1. SQL migrations to paste into the Supabase SQL Editor.
2. How to redeploy the Supabase edge functions so the CORS + template + ticket-
   stamping changes take effect.

---

## 1. SQL migrations (paste into Supabase → SQL Editor → New query → Run)

The block below is **idempotent** — every statement uses `IF NOT EXISTS`, so
running it twice is harmless. It bundles every schema change introduced by the
recent rounds of fixes (table-purchaser template, `last_ticket_email_at`
tracking, the two notification templates extracted from the edge function).

```sql
-- ───────────────────────────────────────────────────────────────────────────
-- 1) New editable email templates on app_settings.
--    The application code already falls back to sensible defaults when
--    these are NULL, so this is safe to apply alongside the deploy.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.app_settings
    -- Dedicated template for table buyers (8-seat / multi-seat purchases).
    ADD COLUMN IF NOT EXISTS email_table_purchaser_subject text,
    ADD COLUMN IF NOT EXISTS email_table_purchaser_body text,

    -- Notification to the purchaser when a guest of theirs claims.
    -- Was previously hardcoded inside the edge function.
    ADD COLUMN IF NOT EXISTS email_guest_completion_notify_subject text,
    ADD COLUMN IF NOT EXISTS email_guest_completion_notify_body text,

    -- Notification to the sponsor/exhibitor org contact when their
    -- staff completes registration. Was previously hardcoded.
    ADD COLUMN IF NOT EXISTS email_exhibitor_staff_completion_notify_subject text,
    ADD COLUMN IF NOT EXISTS email_exhibitor_staff_completion_notify_body text;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Dashboard "Ticket Sent" tracking.
--    Stamped every time a ticket email goes out from any path
--    (purchase, manual tool, resend, edge function claim flows).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.attendees
    ADD COLUMN IF NOT EXISTS last_ticket_email_at timestamptz;

-- Partial index used by dashboard sort / "haven't been emailed in N hours"
-- filters. Keeps the index small by excluding NULLs (the common case).
CREATE INDEX IF NOT EXISTS idx_attendees_last_ticket_email_at
    ON public.attendees (last_ticket_email_at DESC)
    WHERE last_ticket_email_at IS NOT NULL;
```

Verify after running:

```sql
-- Should return the 6 new app_settings columns + last_ticket_email_at.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name LIKE 'email_table_purchaser_%'
    OR column_name LIKE 'email_guest_completion_notify_%'
    OR column_name LIKE 'email_exhibitor_staff_completion_notify_%'
    OR column_name = 'last_ticket_email_at'
  )
ORDER BY column_name;
```

You should see 7 rows.

---

## 2. Redeploy the Supabase edge functions

Two functions changed across the recent PRs:

| Function | Why it changed | PR |
|----------|----------------|----|
| `admin-invite` | CORS allow-list now includes `x-supabase-api-version` | #10 |
| `send-ticket-email` | CORS update, new optional `email.title` banner, table-purchaser path, new notification templates, `last_ticket_email_at` stamping | #10 + #11 |

The other functions (`confirm-sponsor-cheque`, `verify-payment`,
`track-email`) also received the CORS allow-list update from PR #10 and need
the same redeploy.

### Option A — Supabase CLI (recommended)

From a checkout of the merged branch:

```bash
# Authenticate (one-time per machine)
supabase login

# Link the project (one-time per checkout). Project ref is in your
# Supabase dashboard URL, e.g. https://supabase.com/dashboard/project/<REF>.
supabase link --project-ref <YOUR_PROJECT_REF>

# Deploy each function. They're independent, so you can do them all
# in one go or one at a time.
supabase functions deploy admin-invite
supabase functions deploy send-ticket-email
supabase functions deploy verify-payment
supabase functions deploy confirm-sponsor-cheque
supabase functions deploy track-email
```

Each deploy takes ~10 seconds. Watch the output for "Function deployed
successfully" — that's your green light.

### Option B — Supabase Dashboard

1. Go to **Edge Functions** in your Supabase project sidebar.
2. For each function in the list above:
   - Click the function name.
   - Click **Deploy a new version**.
   - Drag-and-drop the function's `index.ts` from
     `supabase/functions/<function-name>/` in this repo, OR paste the
     contents into the editor.
   - Click **Deploy**.

### Verifying the deploy worked

After redeploying `admin-invite`, try inviting a new admin from the
Admins Management page. You should get a temp password back instead
of "edge function could not be reached".

After redeploying `send-ticket-email`, complete a fresh test
registration (or use the Manual Ticket Tool to issue a ticket). The
banner of the email should now read the event name (e.g. "Hope Gala")
instead of "Event Registration". The dashboard "Ticket Sent" column
should show a timestamp for the new attendee.

---

## 3. Quick post-deploy checklist

- [ ] SQL block ran cleanly; verification query returns 7 rows.
- [ ] `admin-invite` redeployed — admin invites work.
- [ ] `send-ticket-email` redeployed — emails show the right event name.
- [ ] In **Settings → Email Templates**, every template in the catalog (now
      including the table-purchaser, the two completion notifications, and
      the five sponsor templates) opens cleanly and the preview renders.
- [ ] **Form titles renamed** to the real event name (e.g. "Hope Gala")
      so `{{event}}` substitutes correctly. The code is now event-name
      aware but the form's `title` field is still the source of truth —
      a form called "Generic Events Registration" will still produce that
      string in emails.

---

## 4. Flutterwave payment provider (PR #17)

Adds **Flutterwave** as a second online payment provider alongside PayPal on the
registration checkout, so African payers (notably **Nigeria** and **Uganda**,
whose cards PayPal rejects) can pay by card / bank transfer / mobile money / USSD.
The provider is **opt-in**: if no Flutterwave key is configured, checkout behaves
exactly as before (PayPal only). When both are configured, the registrant sees a
**PayPal / "Card / Mobile Money"** selector.

The receiving org (GANSID) registers a **Canadian** Flutterwave for Business
account, enables international card payments, and settles to a CAD bank account —
no African entity required. Charge attendees in **USD** for the broadest card
acceptance.

### 4a. SQL migrations (paste into Supabase → SQL Editor → Run, on **both** projects)

Idempotent — safe to re-run.

```sql
-- 1) Allow payment_method = 'flutterwave' on attendees.
--    Purely additive: the new allow-list is a superset of the old one.
ALTER TABLE public.attendees DROP CONSTRAINT IF EXISTS attendees_payment_method_check;
ALTER TABLE public.attendees ADD CONSTRAINT attendees_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method = ANY (ARRAY['card','paypal','flutterwave','cheque','external','promo','bogo']::text[])
  );

-- 2) Flutterwave PUBLIC key fallback for the admin Settings UI.
--    (The SECRET key is NEVER stored in the DB — see 4c.)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS flutterwave_public_key text null;
```

Verify:

```sql
SELECT 1 FROM information_schema.columns
WHERE table_schema='public' AND table_name='app_settings'
  AND column_name='flutterwave_public_key';   -- 1 row
```

### 4b. Get your Flutterwave keys

Flutterwave dashboard → **Settings → API Keys**. You need:
- **Public key** — `FLWPUBK-…` (client-side, safe to expose). Test: `FLWPUBK_TEST-…`.
- **Secret key** — `FLWSECK-…` (server-side ONLY). Test: `FLWSECK_TEST-…`.

### 4c. Server secrets (Supabase function secrets — set on **both** project refs)

These are read by the `verify-payment` edge function. The secret key never
touches the client or the database.

```bash
# Run once per project ref (SCAGO + GANSID).
supabase secrets set FLW_SECRET_KEY="FLWSECK-xxxxxxxx"      # live secret key
supabase secrets set FLW_MODE="live"                        # PIN to live in production (see note)
# Optional — only if you want test-mode verification on this deployment:
supabase secrets set FLW_TEST_SECRET_KEY="FLWSECK_TEST-xxxxxxxx"
```

> **Important — pin `FLW_MODE=live` in production.** When `FLW_MODE` is unset,
> the function may route to test-mode if a submission is flagged as test
> (`is_test`). Pinning `live` prevents that. Use `FLW_MODE=test` only on a
> staging deploy.

### 4d. Client env vars (Netlify → Site configuration → Environment variables, **both** sites)

```
VITE_FLW_PUBLIC_KEY=FLWPUBK-xxxxxxxx
# Optional, for a test/staging site:
VITE_FLW_TEST_PUBLIC_KEY=FLWPUBK_TEST-xxxxxxxx
VITE_FLW_ENV=live          # or "test" on a staging site
```

Alternatively, an admin can paste the **public** key into **Settings → Payment
Configuration → Flutterwave Public Key** (the env var takes precedence).

### 4e. Redeploy the edge function

Only `verify-payment` changed (it now verifies both PayPal and Flutterwave).
No `config.toml` change — it stays `verify_jwt = false`.

```bash
supabase functions deploy verify-payment   # run for both project refs
```

### 4f. Verify end-to-end

1. With keys configured, open a public registration form → you should see a
   **PayPal / "Card / Mobile Money"** selector.
2. On a **test** deploy (`FLW_MODE=test`, `VITE_FLW_ENV=test`), pick Flutterwave
   and pay with the Flutterwave **test card** `5531 8866 5214 2950`, CVV `564`,
   exp `09/32`, PIN `3310`, OTP `12345`.
3. Confirm the new attendee row has `payment_method = 'flutterwave'`, the
   `transaction_id` is set, and the confirmation email fires.
4. Tamper check: a payment whose amount/currency doesn't match the
   server-recomputed total is rejected (422); a re-submitted transaction id is
   rejected (409).

### 4g. Known limitations / notes

- **Currency:** charge in **USD** (cleanest for a Canadian account + global
  payers). The pricing model stores amounts in cents, so **zero-decimal
  currencies (UGX, RWF, JPY) are not yet supported** for dynamic-pricing
  templates — this predates Flutterwave and applies to PayPal too.
- **Scope:** Flutterwave is wired into the **registration** flows (static +
  dynamic). Sponsor and booth-extras checkouts remain PayPal-only.
- **Recommended follow-up:** a `flutterwave-webhook` function (validating the
  `verif-hash` header, then re-querying `/verify`) to record payments whose
  client callback was lost — same exposure PayPal has today.
