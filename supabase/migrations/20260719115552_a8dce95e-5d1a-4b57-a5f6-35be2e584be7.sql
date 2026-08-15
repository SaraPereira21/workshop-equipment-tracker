
-- FLEET CATALOG (dados SAP + cadastros novos)
CREATE TABLE public.fleet_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_armac TEXT NOT NULL UNIQUE,
  modelo TEXT NOT NULL DEFAULT '',
  tipo_objeto TEXT DEFAULT '',
  numero_serie TEXT DEFAULT '',
  numero_inventario TEXT DEFAULT '',
  marca TEXT DEFAULT '',
  fonte TEXT NOT NULL DEFAULT 'SAP',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fleet_assets_modelo_idx ON public.fleet_assets USING GIN (to_tsvector('portuguese', modelo));
CREATE INDEX fleet_assets_tipo_idx ON public.fleet_assets (tipo_objeto);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_assets TO authenticated;
GRANT ALL ON public.fleet_assets TO service_role;
ALTER TABLE public.fleet_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fleet select authenticated" ON public.fleet_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "fleet insert admin/pcm/frota" ON public.fleet_assets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm') OR public.has_role(auth.uid(),'frota'));
CREATE POLICY "fleet update admin/pcm/frota" ON public.fleet_assets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm') OR public.has_role(auth.uid(),'frota'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm') OR public.has_role(auth.uid(),'frota'));
CREATE POLICY "fleet delete admin" ON public.fleet_assets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER fleet_assets_updated_at BEFORE UPDATE ON public.fleet_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- KANBAN COLUMNS (nomes editáveis)
CREATE TABLE public.kanban_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  titulo_curto TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  cor TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns TO authenticated;
GRANT ALL ON public.kanban_columns TO service_role;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kanban select all authenticated" ON public.kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "kanban admin manage" ON public.kanban_columns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm'));

CREATE TRIGGER kanban_columns_updated_at BEFORE UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default columns
INSERT INTO public.kanban_columns (chave, titulo, titulo_curto, ordem) VALUES
  ('chegada','Nova Solicitação','Nova Solic.',1),
  ('pcm','Fila PCM (Criar OS SAP)','PCM',2),
  ('triagem','Triagem / Fila Supervisor','Triagem',3),
  ('manutencao','Em Manutenção','Manutenção',4),
  ('teste','Em Teste / Liberação','Teste',5),
  ('aguardando_pcm','Aguardando Preventiva PCM','Aguard. PCM',6),
  ('liberado','Liberado / Despachado','Liberado',7);
