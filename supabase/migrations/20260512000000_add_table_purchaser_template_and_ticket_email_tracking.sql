-- Adds:
-- 1. A dedicated table-purchaser email template (subject + HTML body) on
--    app_settings. Distinct from the standard ticket confirmation so the
--    table-host messaging (guest claim links, "you've purchased a table for
--    8", etc.) can be edited independently. The application falls back to
--    the standard ticket template if these are NULL, so the migration is
--    safe to apply ahead of any code release that uses them.
--
-- 2. A `last_ticket_email_at` timestamp on `attendees` so the dashboard can
--    show staff who has and hasn't been notified. Stamped by every send
--    path (initial purchase confirmation, manual ticket tool, modal
--    "Resend ticket"). Nullable — `NULL` means we have no record of a
--    send, which is the safe default for legacy rows.

ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS email_table_purchaser_subject text,
    ADD COLUMN IF NOT EXISTS email_table_purchaser_body text,
    -- Sent to the primary purchaser when one of their guests completes
    -- their claim. Previously hardcoded inside the edge function.
    ADD COLUMN IF NOT EXISTS email_guest_completion_notify_subject text,
    ADD COLUMN IF NOT EXISTS email_guest_completion_notify_body text,
    -- Sent to the sponsor/exhibitor org contact when one of their staff
    -- members completes their claim. Previously hardcoded.
    ADD COLUMN IF NOT EXISTS email_exhibitor_staff_completion_notify_subject text,
    ADD COLUMN IF NOT EXISTS email_exhibitor_staff_completion_notify_body text;

ALTER TABLE public.attendees
    ADD COLUMN IF NOT EXISTS last_ticket_email_at timestamptz;

-- Index used by dashboard sort/filter ("show people who haven't been
-- emailed in the last 24h"). Partial index keeps it small — we mostly
-- care about timestamps that exist.
CREATE INDEX IF NOT EXISTS idx_attendees_last_ticket_email_at
    ON public.attendees (last_ticket_email_at DESC)
    WHERE last_ticket_email_at IS NOT NULL;
