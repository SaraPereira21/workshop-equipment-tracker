
-- Public read (bucket é público, mas garantimos a policy)
CREATE POLICY "oficina_uploads_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'oficina-uploads');

CREATE POLICY "oficina_uploads_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'oficina-uploads');

CREATE POLICY "oficina_uploads_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'oficina-uploads')
WITH CHECK (bucket_id = 'oficina-uploads');

CREATE POLICY "oficina_uploads_auth_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'oficina-uploads');
