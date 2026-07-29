-- email_sends: record WHICH attendee a send was for, not just the address.
--
-- `attendees.email` is deliberately non-unique (partners/colleagues share an
-- inbox — see CLAUDE.md §18 "attendees.email is NOT an identity key"). The
-- Signups tab's "Last email" column keyed `email_sends` by `recipient_email`,
-- so two attendees on one address showed each other's last send.
--
-- Additive + nullable: every existing row keeps working, and the email-keyed
-- lookup stays as the fallback for historical rows that predate this column.
--
-- NOTE: attendees.id is TEXT (not uuid) on BOTH tenants — a uuid FK here would
-- fail with `42804 incompatible types: uuid and text`. See CLAUDE.md §18.

ALTER TABLE public.email_sends
  ADD COLUMN IF NOT EXISTS recipient_attendee_id TEXT
    REFERENCES public.attendees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_sends_recipient_attendee
  ON public.email_sends (recipient_attendee_id, sent_at DESC)
  WHERE recipient_attendee_id IS NOT NULL;
