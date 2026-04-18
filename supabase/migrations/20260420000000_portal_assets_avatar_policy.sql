-- Allow authenticated users to upload their own avatar to portal-assets/avatars/{user.id}.{ext}
-- The admin-only policies remain for all other paths.

DROP POLICY IF EXISTS "portal_assets_avatar_self_upload" ON storage.objects;
CREATE POLICY "portal_assets_avatar_self_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'portal-assets'
    AND auth.role() = 'authenticated'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  );

DROP POLICY IF EXISTS "portal_assets_avatar_self_update" ON storage.objects;
CREATE POLICY "portal_assets_avatar_self_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'portal-assets'
    AND auth.role() = 'authenticated'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  );

DROP POLICY IF EXISTS "portal_assets_avatar_self_delete" ON storage.objects;
CREATE POLICY "portal_assets_avatar_self_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'portal-assets'
    AND auth.role() = 'authenticated'
    AND name LIKE 'avatars/' || auth.uid()::text || '.%'
  );
