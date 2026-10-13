-- Read-only "viewer" role for partner organisations.
--
-- GANSID's registration partner TSCS India sells congress places on its own
-- website and asked to check, in our platform, that every delegate it sent us
-- was registered. They need to SEE the attendee dashboard, not change it.
--
-- Until now the only dashboard roles were admin and super_admin, and both can
-- edit, delete and email any registrant. A viewer:
--   * may SELECT attendees and email_failures — the two admin-only tables the
--     attendee dashboard reads (forms, app_settings and the seating tables are
--     already readable by any signed-in user);
--   * gets NO insert / update / delete anywhere new. Every existing write
--     policy keys on is_portal_admin(), which deliberately does NOT include
--     viewer, so it is untouched;
--   * is refused by every admin edge function, which all check for admin /
--     super_admin explicitly.
-- The UI hides write controls for viewers (utils/adminPermissions.ts
-- canEditAdminData); this migration is what actually enforces it.
--
-- Granting the role is a manual super-admin action:
--   UPDATE public.profiles SET role = 'viewer' WHERE lower(email) = '…';
-- Nobody can give it to themselves: handle_new_user only accepts attendee /
-- exhibitor / sponsor at signup, and prevent_self_role_change blocks a user
-- editing their own role.

-- @check-constraint: probed — GANSID production on 2026-10-13 held only
-- admin, sponsor, exhibitor, attendee, super_admin; the new list is a superset.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('attendee', 'exhibitor', 'sponsor', 'admin', 'super_admin', 'viewer'));

-- True for anyone who may READ the admin dashboard. Never use this for a
-- write policy — writes stay on is_portal_admin().
CREATE OR REPLACE FUNCTION public.is_portal_viewer()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'viewer')
  );
$$;

REVOKE ALL ON FUNCTION public.is_portal_viewer() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_portal_viewer() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_portal_viewer() TO authenticated;

DROP POLICY IF EXISTS attendees_viewer_read ON public.attendees;
CREATE POLICY attendees_viewer_read ON public.attendees
  FOR SELECT TO authenticated
  USING (public.is_portal_viewer());

DROP POLICY IF EXISTS email_failures_viewer_read ON public.email_failures;
CREATE POLICY email_failures_viewer_read ON public.email_failures
  FOR SELECT TO authenticated
  USING (public.is_portal_viewer());
