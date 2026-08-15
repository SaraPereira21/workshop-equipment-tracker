CREATE TABLE IF NOT EXISTS public.sap_materials (
  codigo TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  estoque NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sap_materials TO authenticated;
GRANT SELECT ON public.sap_materials TO anon;
GRANT ALL ON public.sap_materials TO service_role;
ALTER TABLE public.sap_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sap_materials_read_all" ON public.sap_materials FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS sap_materials_desc_idx ON public.sap_materials USING gin (to_tsvector('portuguese', descricao));