ALTER TABLE public.pmp_plans ADD COLUMN IF NOT EXISTS familia text;
DROP INDEX IF EXISTS public.pmp_plans_modelo_intervalo_key;
CREATE UNIQUE INDEX IF NOT EXISTS pmp_plans_modelo_familia_intervalo_key
  ON public.pmp_plans (modelo, COALESCE(familia, ''), intervalo_horas);