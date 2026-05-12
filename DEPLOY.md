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
