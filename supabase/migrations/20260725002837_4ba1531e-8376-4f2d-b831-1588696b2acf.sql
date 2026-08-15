CREATE TABLE public.pmp_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo text NOT NULL,
  modelo_original text NOT NULL,
  fabricante text,
  intervalo_horas integer NOT NULL,
  intervalo_label text NOT NULL,
  codigo_plano text,
  setor_executante text,
  origem_arquivo text,
  criado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pmp_plans_modelo_intervalo_key ON public.pmp_plans (modelo, intervalo_horas);

CREATE TABLE public.pmp_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.pmp_plans(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  item text,
  procedimento text NOT NULL,
  servico text,
  material text,
  material_codigo text,
  qtde numeric,
  unidade text,
  tempo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmp_operations_plan_id_idx ON public.pmp_operations (plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pmp_plans TO authenticated;
GRANT ALL ON public.pmp_plans TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pmp_operations TO authenticated;
GRANT ALL ON public.pmp_operations TO service_role;

ALTER TABLE public.pmp_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmp_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth manage pmp_plans" ON public.pmp_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth manage pmp_operations" ON public.pmp_operations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER pmp_plans_set_updated_at BEFORE UPDATE ON public.pmp_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();