-- 20260915120000_allow_admin_delete_email_sends.sql
--
-- email_sends had admin INSERT and admin SELECT policies but no DELETE, so a
-- row written by the dashboard could never be removed by the dashboard. Two
-- consequences, both real:
--
--   * The QA agent (scripts/qa/qa-run.mjs) deletes every attendee row it
--     creates, but the email_sends rows its bulk-send flow writes outlived the
--     run. Every live QA pass left permanent log rows behind.
--   * An admin who fires a bulk campaign at the wrong audience has no way to
--     clear the resulting log, and those rows drive the "Last email" column in
--     the Signups and Contacts tabs — so a mistake stays on screen forever.
--
-- The table is already admin-only in both directions (is_portal_admin() guards
-- read and insert; the track-email edge function updates it with the service
-- role, bypassing RLS). Granting the same admins DELETE therefore widens no
-- audience — it only lets the people who can already read and write the log
-- also correct it. Deliberately NOT granted to anon or to ordinary
-- authenticated users.

DROP POLICY IF EXISTS email_sends_admin_delete ON public.email_sends;
CREATE POLICY email_sends_admin_delete ON public.email_sends
  FOR DELETE
  USING (public.is_portal_admin());
