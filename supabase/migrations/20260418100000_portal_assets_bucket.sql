-- Portal-assets bucket + RLS policies for admin-only upload, public read.
-- Already applied to both Supabase projects out-of-band; this file codifies it in source control.

INSERT INTO storage.buckets (id, name, public) VALUES ('portal-assets', 'portal-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "portal_assets_public_read" ON storage.objects;
CREATE POLICY "portal_assets_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'portal-assets');

DROP POLICY IF EXISTS "portal_assets_admin_upload" ON storage.objects;
CREATE POLICY "portal_assets_admin_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'portal-assets' AND public.is_portal_admin());

DROP POLICY IF EXISTS "portal_assets_admin_update" ON storage.objects;
CREATE POLICY "portal_assets_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'portal-assets' AND public.is_portal_admin());

DROP POLICY IF EXISTS "portal_assets_admin_delete" ON storage.objects;
CREATE POLICY "portal_assets_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'portal-assets' AND public.is_portal_admin());
