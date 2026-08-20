-- Durable record of email send failures.
--
-- WHY
-- An admin reported "we can no longer send reminder emails" with only an
-- unexplained edge-function error to go on. The real cause was the provider
-- refusing further mail — `550 You have reached your daily email sending
-- quota.` — after 163 sends in one morning (85 invitations, then 78 reminders).
--
-- Nothing recorded it. `logEmailSend` runs only AFTER a successful send, so a
-- failed send left no trace anywhere: not in `email_sends`, not in the UI, and
-- edge-function logs age out unread (and are unreachable entirely on GANSID,
-- whose project sits in an org the MCP token cannot see). Diagnosing it meant
-- reproducing the failure by hand against production.
--
-- This is the same blind spot `payment_failures` was created to close, and this
-- table deliberately mirrors it: an admin can answer "did that email actually
-- go out, and if not why" without a developer.
--
-- No message bodies and no credentials are stored — just enough to trace an
-- attempt back to a person, a template and a provider response.

CREATE TABLE IF NOT EXISTS public.email_failures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  -- send-ticket-email `mode` (raw-html, staff-invite, bogo-ticket, …). Tells
  -- you which flow broke.
  mode          text,
  -- Admin-facing template key where the caller knows it (reminder, invitation).
  template_key  text,
  recipient     text,
  form_id       text,
  -- attendees.id is TEXT on both tenants — a uuid column here fails at
  -- migration time with 42804 (documented gotcha).
  attendee_id   text,
  -- Classification from utils/emailSendErrors.ts: quota | auth | connection |
  -- recipient | not-configured | unknown. Lets an admin filter "is this a
  -- provider-wide stoppage or one bad address?" at a glance.
  kind          text,
  -- Verbatim provider response, e.g. the 550 line. The recovery key.
  message       text,
  subject       text,
  resolved_at   timestamptz,
  resolved_note text
);

CREATE INDEX IF NOT EXISTS idx_email_failures_occurred
  ON public.email_failures (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_failures_unresolved
  ON public.email_failures (occurred_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_failures_recipient
  ON public.email_failures (recipient);

ALTER TABLE public.email_failures ENABLE ROW LEVEL SECURITY;

-- Admin-only read. Writes come from send-ticket-email via the service role,
-- which bypasses RLS — deliberately NO anon insert policy, so the table cannot
-- be spammed with forged rows from the public bundle.
DROP POLICY IF EXISTS email_failures_admin_read ON public.email_failures;
CREATE POLICY email_failures_admin_read ON public.email_failures
  FOR SELECT TO authenticated
  USING (public.is_portal_admin());

DROP POLICY IF EXISTS email_failures_admin_update ON public.email_failures;
CREATE POLICY email_failures_admin_update ON public.email_failures
  FOR UPDATE TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());
