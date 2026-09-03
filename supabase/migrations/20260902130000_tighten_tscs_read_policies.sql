-- 20260902130000_tighten_tscs_read_policies.sql
--
-- SECURITY FIX: both TSCS tables granted SELECT to `authenticated` with
-- USING (true), which is every signed-in account — not admins.
--
-- handle_new_user (20260419005000) gives every public portal signup a profiles
-- row and an authenticated JWT, so any attendee who created an account could
-- read:
--   * tscs_email_registrations.raw — the verbatim confirmation emails, i.e.
--     other registrants' names, emails, phone numbers and payment ids;
--   * tscs_poll_runs.error / triggered_by — IMAP failure strings (which can
--     carry the mailbox host and user) and admin email addresses.
--
-- Both policies were NAMED *_admin_read and commented as admin-only; only the
-- predicate was wrong. public.is_portal_admin() is the house helper already
-- guarding payment_failures (20260810120000) and email_failures.
--
-- Also drops tscs_poll_runs_healthy_idx: it was built for a "last successful
-- live poll" SQL predicate, but the dashboard fetches the newest runs and
-- filters in JS, so no query ever matched it — pure insert cost on a table
-- written ~144x/day.

-- @destructive: confirmed
DROP INDEX IF EXISTS public.tscs_poll_runs_healthy_idx;

DROP POLICY IF EXISTS tscs_poll_runs_admin_read ON public.tscs_poll_runs;
CREATE POLICY tscs_poll_runs_admin_read ON public.tscs_poll_runs
  FOR SELECT TO authenticated
  USING (public.is_portal_admin());

DROP POLICY IF EXISTS tscs_email_admin_read ON public.tscs_email_registrations;
CREATE POLICY tscs_email_admin_read ON public.tscs_email_registrations
  FOR SELECT TO authenticated
  USING (public.is_portal_admin());
