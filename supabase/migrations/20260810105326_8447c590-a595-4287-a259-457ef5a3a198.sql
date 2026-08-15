CREATE TABLE public.seminovos_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefixo text NOT NULL,
  prefixo_norm text NOT NULL,
  modelo text DEFAULT '',
  familia text DEFAULT '',
  serie text DEFAULT '',
  ano text DEFAULT '',
  preco_venda numeric DEFAULT 0,
  data_liberacao_venda date,
  status_sn text DEFAULT '',
  status_manutencao text DEFAULT '',
  localizacao text DEFAULT '',
  obs text DEFAULT '',
  origem_arquivo text,
  importado_em timestamptz NOT NULL DEFAULT now(),
  importado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX seminovos_items_prefixo_norm_key ON public.seminovos_items (prefixo_norm);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seminovos_items TO authenticated;
GRANT ALL ON public.seminovos_items TO service_role;
ALTER TABLE public.seminovos_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seminovos select authenticated" ON public.seminovos_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "seminovos manage gestao" ON public.seminovos_items FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pcm') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'frota'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pcm') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'frota'));

CREATE TRIGGER seminovos_items_updated_at BEFORE UPDATE ON public.seminovos_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.seminovos_meta (
  mes text PRIMARY KEY,
  valor numeric NOT NULL DEFAULT 5000000,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seminovos_meta TO authenticated;
GRANT ALL ON public.seminovos_meta TO service_role;
ALTER TABLE public.seminovos_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seminovos meta select" ON public.seminovos_meta FOR SELECT TO authenticated USING (true);
CREATE POLICY "seminovos meta manage" ON public.seminovos_meta FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pcm') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'frota'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pcm') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'frota'));
CREATE TRIGGER seminovos_meta_updated_at BEFORE UPDATE ON public.seminovos_meta
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();