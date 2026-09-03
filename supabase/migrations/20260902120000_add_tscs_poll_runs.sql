-- 20260902120000_add_tscs_poll_runs.sql
--
-- Observability for the TSCS India email-ingest poller.
--
-- The audit table (tscs_email_registrations) records EMAILS, which answers
-- "what did we ingest?" but not "is the poller alive?" — a healthy poll of an
-- empty mailbox writes nothing at all, so a silent audit table is
-- indistinguishable from a cron that has been dead for three days. That
-- ambiguity is the whole reason this table exists: every poll attempt writes
-- exactly one row here, success or failure, so the dashboard can say "last
-- checked 4 minutes ago" instead of guessing.
--
-- Rows are small and bounded (one per poll, ~144/day at the 10-minute cadence);
-- no retention policy for now, and the dashboard reads only the newest few.

CREATE TABLE IF NOT EXISTS public.tscs_poll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  -- false when the poll could not complete (IMAP auth/DNS/timeout). `error`
  -- then carries the reason shown in the dashboard's health banner.
  ok boolean NOT NULL DEFAULT false,
  -- Dry runs read and parse but write nothing; kept out of the "last healthy
  -- ingest" reading so a rehearsal can't mask a broken live cron.
  dry_run boolean NOT NULL DEFAULT false,
  -- 'cron' (GitHub Actions schedule), 'dashboard' (admin pressed Check now),
  -- or 'manual' (curl / one-off).
  source text NOT NULL DEFAULT 'cron',
  -- Per-outcome tallies for the messages seen in THIS run.
  processed integer NOT NULL DEFAULT 0,
  ingested integer NOT NULL DEFAULT 0,
  needs_review integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  ignored integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  error text,
  -- Admin email when a human triggered it from the dashboard; NULL for cron.
  triggered_by text
);

-- The dashboard's hot query is "newest runs first"; the partial index serves
-- the "last successful LIVE poll" health reading without a seq scan.
CREATE INDEX IF NOT EXISTS tscs_poll_runs_started_at_idx
  ON public.tscs_poll_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS tscs_poll_runs_healthy_idx
  ON public.tscs_poll_runs (started_at DESC)
  WHERE ok AND NOT dry_run;

ALTER TABLE public.tscs_poll_runs ENABLE ROW LEVEL SECURITY;

-- The poller writes as the service role; admins read the history from the
-- dashboard. No anon access — run rows expose mailbox activity patterns.
DROP POLICY IF EXISTS tscs_poll_runs_service_full ON public.tscs_poll_runs;
CREATE POLICY tscs_poll_runs_service_full ON public.tscs_poll_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tscs_poll_runs_admin_read ON public.tscs_poll_runs;
CREATE POLICY tscs_poll_runs_admin_read ON public.tscs_poll_runs
  FOR SELECT TO authenticated USING (true);
