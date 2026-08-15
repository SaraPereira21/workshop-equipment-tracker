
-- Restrict storage writes to file owner (fixes critical finding)
DROP POLICY IF EXISTS oficina_uploads_auth_update ON storage.objects;
DROP POLICY IF EXISTS oficina_uploads_auth_delete ON storage.objects;
DROP POLICY IF EXISTS oficina_uploads_auth_insert ON storage.objects;

CREATE POLICY oficina_uploads_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'oficina-uploads' AND owner = auth.uid());

CREATE POLICY oficina_uploads_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'oficina-uploads' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'oficina-uploads' AND owner = auth.uid());

-- Admin/PCM can delete any file; owners can delete their own
CREATE POLICY oficina_uploads_owner_or_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'oficina-uploads'
    AND (
      owner = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'pcm'::public.app_role)
    )
  );

-- Restrict email_recipients reads to admin/pcm/inspetor (roles that send liberação)
DROP POLICY IF EXISTS "auth users read recipients" ON public.email_recipients;

CREATE POLICY "admin/pcm/inspetor read recipients" ON public.email_recipients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pcm'::public.app_role)
    OR public.has_role(auth.uid(), 'inspetor'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );
