-- 20260901120100_add_tscs_email_registrations.sql
--
-- Audit + review queue for the TSCS India email-ingest pipeline.
--
-- Every confirmation email the poller reads from the IONOS inbox lands here:
-- successfully-ingested ones for the audit trail (which attendee did this
-- email create?), unparseable ones as 'needs-review' so a human can finish
-- them by hand instead of the registration silently vanishing. The raw email
-- body is kept because it is the only source of truth if parsing was wrong.
--
-- message_id is UNIQUE: the poller may see the same email twice (IMAP flag
-- write failed, overlapping poll runs) and the insert conflict is what makes
-- re-processing idempotent.

CREATE TABLE IF NOT EXISTS public.tscs_email_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  from_addr text,
  subject text,
  received_at timestamptz,
  raw text,
  parsed jsonb,
  status text NOT NULL DEFAULT 'needs-review'
    CHECK (status IN ('ingested', 'needs-review', 'duplicate', 'error', 'ignored')),
  attendee_id text,
  error text,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tscs_email_registrations ENABLE ROW LEVEL SECURITY;

-- The pipeline runs with the service role; admins can read the queue from the
-- dashboard. No anon access of any kind — raw emails contain personal data.
DROP POLICY IF EXISTS tscs_email_service_full ON public.tscs_email_registrations;
CREATE POLICY tscs_email_service_full ON public.tscs_email_registrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tscs_email_admin_read ON public.tscs_email_registrations;
CREATE POLICY tscs_email_admin_read ON public.tscs_email_registrations
  FOR SELECT TO authenticated USING (true);
