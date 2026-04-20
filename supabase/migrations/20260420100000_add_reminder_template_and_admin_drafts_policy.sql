-- "Complete your registration" reminder template + admin visibility on drafts.
--
-- 1. New app_settings columns `email_reminder_subject` / `email_reminder_body`
--    power a new admin-only template used from the Signups tab to nudge portal
--    users who signed up but haven't completed their registration.
--
-- 2. Admins need to read every registration_draft row (not just their own) to
--    show "In progress — step N of M" status in the Signups tab. The existing
--    "Users manage own drafts" policy stays in place for regular users; we
--    layer an admin SELECT policy on top.

-- Template columns
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS email_reminder_subject text,
  ADD COLUMN IF NOT EXISTS email_reminder_body text;

-- Admin read access to all drafts (for Signups tab progress column)
DROP POLICY IF EXISTS "registration_drafts_admin_read" ON public.registration_drafts;
CREATE POLICY "registration_drafts_admin_read" ON public.registration_drafts
  FOR SELECT
  USING (public.is_portal_admin());
