CREATE OR REPLACE FUNCTION public.user_ids_by_roles(_roles text[])
RETURNS TABLE(user_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id, ur.role::text
  FROM public.user_roles ur
  WHERE ur.role::text = ANY(_roles)
$$;

REVOKE ALL ON FUNCTION public.user_ids_by_roles(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_ids_by_roles(text[]) TO authenticated, service_role;