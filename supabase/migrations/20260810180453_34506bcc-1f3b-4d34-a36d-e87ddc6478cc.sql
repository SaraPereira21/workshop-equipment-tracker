CREATE TABLE public.seminovos_prioridade (
  prefixo_norm text PRIMARY KEY,
  ordem integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seminovos_prioridade TO authenticated;
GRANT ALL ON public.seminovos_prioridade TO service_role;

ALTER TABLE public.seminovos_prioridade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prioridade select authenticated" ON public.seminovos_prioridade
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "prioridade manage gestao" ON public.seminovos_prioridade
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'pcm'::app_role) OR has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'frota'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'pcm'::app_role) OR has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'frota'::app_role));