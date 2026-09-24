-- Only admins may change app_settings.
--
-- app_settings holds every email template, the sender identity, branding and
-- the payment configuration (PayPal client id, Flutterwave key, pricing
-- flags). Its policies allowed far more than the app needs:
--
--   * "Allow all access to app_settings" (GANSID, from the initial schema):
--     FOR ALL TO public USING (true) — anyone holding the public anon key,
--     which ships in every page, could UPDATE settings without signing in.
--   * admin_manage_settings (both tenants): FOR ALL TO authenticated
--     USING (true) — despite the name, any signed-in account could change
--     settings, including the ~400 attendee, sponsor and exhibitor logins.
--
-- The only writers are admin screens (Settings, Sponsor templates, the
-- attendee list's column preferences — all via saveSettings' upsert) and edge
-- functions using the service role, which bypasses RLS. So writes become
-- is_portal_admin() only; INSERT and UPDATE both, because the upsert needs
-- both. Reads are unchanged: public pages (anon) and signed-in attendees
-- still load settings, and signed-in users keep the SELECT they had through
-- admin_manage_settings.
--
-- Idempotent: every policy is dropped by name before it is (re)created.

DROP POLICY IF EXISTS "Allow all access to app_settings" ON public.app_settings;
DROP POLICY IF EXISTS admin_manage_settings ON public.app_settings;

DROP POLICY IF EXISTS authenticated_can_view_settings ON public.app_settings;
CREATE POLICY authenticated_can_view_settings ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS admin_insert_settings ON public.app_settings;
CREATE POLICY admin_insert_settings ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_portal_admin());

DROP POLICY IF EXISTS admin_update_settings ON public.app_settings;
CREATE POLICY admin_update_settings ON public.app_settings
  FOR UPDATE TO authenticated USING (public.is_portal_admin()) WITH CHECK (public.is_portal_admin());

DROP POLICY IF EXISTS admin_delete_settings ON public.app_settings;
CREATE POLICY admin_delete_settings ON public.app_settings
  FOR DELETE TO authenticated USING (public.is_portal_admin());
