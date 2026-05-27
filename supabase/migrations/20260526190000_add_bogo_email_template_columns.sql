-- Adds admin-editable BOGO email template overrides to app_settings.
--
-- Each pair (subject/body) corresponds to one of the four BOGO modes in
-- send-ticket-email. NULL (the default) means "use the baked-in default
-- HTML from the edge function" — no functional change. Setting a value
-- here overrides the default for the next email send.
--
-- See docs/superpowers/specs/2026-05-26-bogo-gansid-design.md §9.

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS email_bogo_ticket_subject           TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_ticket_body              TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_claim_link_subject       TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_claim_link_body          TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_ticket_updated_subject   TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_ticket_updated_body      TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_ticket_withdrawn_subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS email_bogo_ticket_withdrawn_body    TEXT NULL;
