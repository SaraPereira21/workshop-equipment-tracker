-- 1) sap_materials: restrict read to authenticated users only
DROP POLICY IF EXISTS "sap_materials_read_all" ON public.sap_materials;
REVOKE SELECT ON public.sap_materials FROM anon;
GRANT SELECT ON public.sap_materials TO authenticated;
GRANT ALL ON public.sap_materials TO service_role;
CREATE POLICY "sap_materials_read_authenticated"
  ON public.sap_materials FOR SELECT TO authenticated USING (true);

-- 2) SECURITY DEFINER trigger function should not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;