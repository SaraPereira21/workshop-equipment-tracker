-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin','pcm','supervisor','frota','inspetor','mecanico');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text,
  cargo text DEFAULT '',
  especialidade text DEFAULT '',
  turno text DEFAULT 'manha',
  telefone text DEFAULT '',
  assinatura_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Policies: profiles
CREATE POLICY "profiles select own or admin" ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles update own or admin" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles insert admin" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "profiles delete admin" ON public.profiles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policies: user_roles
CREATE POLICY "roles select self or admin" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "roles admin manage" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + grant admin to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)));

  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;

-- FLEET CATALOG (dados SAP + cadastros novos)
CREATE TABLE public.fleet_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_Ativo TEXT NOT NULL UNIQUE,
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

CREATE TABLE public.email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  contrato text,
  perfil text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_recipients TO authenticated;
GRANT ALL ON public.email_recipients TO service_role;

ALTER TABLE public.email_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read recipients" ON public.email_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin/pcm insert recipients" ON public.email_recipients FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm'));
CREATE POLICY "admin/pcm update recipients" ON public.email_recipients FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm'));
CREATE POLICY "admin/pcm delete recipients" ON public.email_recipients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm'));

CREATE TRIGGER trg_email_recipients_updated_at BEFORE UPDATE ON public.email_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL,
  prefixo text,
  assunto text,
  destinatarios text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  response text,
  payload jsonb,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read own logs" ON public.email_logs FOR SELECT TO authenticated
  USING (sent_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pcm'));
CREATE POLICY "auth users insert logs" ON public.email_logs FOR INSERT TO authenticated
  WITH CHECK (sent_by = auth.uid());

-- Add CPF and password-change flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique ON public.profiles (cpf) WHERE cpf IS NOT NULL;

-- Update handle_new_user to store cpf/nome/cargo from user_metadata; first user still becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_first boolean;
BEGIN
  INSERT INTO public.profiles (id, email, nome, cpf, cargo, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'cpf',
    NEW.raw_user_meta_data->>'cargo',
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false)
  );

  SELECT NOT EXISTS(SELECT 1 FROM public.user_roles) INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists (it may or may not)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Realinhar buckets com os 8 da planilha real do Planner + manter workflow interno (pcm/atribu_do)
-- 1. Atualizar títulos e ordem dos buckets existentes
UPDATE public.kanban_columns SET titulo='INSERIR',            titulo_curto='INSERIR',       ordem=0 WHERE chave='chegada';
UPDATE public.kanban_columns SET titulo='Fila PCM (OS SAP)',  titulo_curto='PCM',           ordem=1 WHERE chave='pcm';
UPDATE public.kanban_columns SET titulo='Aguardando Material', titulo_curto='Aguard. Material', ordem=4 WHERE chave='aguardando_pcm';
UPDATE public.kanban_columns SET titulo='Aguardando MO',      titulo_curto='Aguard. MO',    ordem=5 WHERE chave='mdo';
UPDATE public.kanban_columns SET titulo='Manutentor Alocado', titulo_curto='Alocado',       ordem=6 WHERE chave='atribu_do';
UPDATE public.kanban_columns SET titulo='Em Execução',        titulo_curto='Em Execução',   ordem=7 WHERE chave='manutencao';
UPDATE public.kanban_columns SET titulo='Melhoria',           titulo_curto='Melhoria',      ordem=8 WHERE chave='melhoria';
UPDATE public.kanban_columns SET titulo='Liberado',           titulo_curto='Liberado',      ordem=9 WHERE chave='liberado';

-- 2. Inserir os 2 buckets novos da planilha
INSERT INTO public.kanban_columns (chave, titulo, titulo_curto, ordem) VALUES
  ('aguardando_rc',     'Aguardando RC',     'Aguard. RC',     2),
  ('aguardando_pedido', 'Aguardando Pedido', 'Aguard. Pedido', 3)
ON CONFLICT (chave) DO UPDATE SET titulo=EXCLUDED.titulo, titulo_curto=EXCLUDED.titulo_curto, ordem=EXCLUDED.ordem;

-- Garantir pgcrypto para crypt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_password text := 'Oficina@2026';
  v_encrypted text := crypt('Oficina@2026', gen_salt('bf'));
  r record;
  v_uid uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('60502123338', 'ALEF SILVA MAXIMIANO',                'Lavador',                          'mecanico'::app_role),
      ('02162529386', 'ANDERSON ABREU DE LIMA',              'Mecânico Sênior II',               'mecanico'::app_role),
      ('60957300310', 'ANDERSON JOSE RODRIGUES DA FONSECA',  'Auxiliar de Mecânico I',           'mecanico'::app_role),
      ('03014091375', 'CARLOS LEANDRO SILVA DA COSTA',       'Mecânico Pleno IV',                'mecanico'::app_role),
      ('21904065368', 'EDNARDO FELIX DE OLIVEIRA',           'Mecânico Sênior VI',               'mecanico'::app_role),
      ('44683669315', 'ERINEUDO DA SILVA BARROS',            'Mecânico Sênior VI',               'mecanico'::app_role),
      ('96273380368', 'FRANCISCO AZEVEDO DOS SANTOS LIMA',   'Mecânico Pleno',                   'mecanico'::app_role),
      ('91733804315', 'FRANCISCO LUZIVALDO DA SILVA ROSA',   'Mecânico Eletricista Pleno I',     'mecanico'::app_role),
      ('07800725375', 'FRANCISCO SAMUEL XAVIER DE SOUZA',    'Mecânico Júnior I',                'mecanico'::app_role),
      ('01203930348', 'GLAILTON OLIVEIRA SOARES',            'Auxiliar de Mecânico I',           'mecanico'::app_role),
      ('62380793395', 'MARCIO LEAN BERNARDINO DA SILVA',     'Auxiliar de Mecânico I',           'mecanico'::app_role),
      ('63170529307', 'MATHEUS MESQUITA DE ARAUJO',          'Auxiliar de Mecânico de Comboio',  'mecanico'::app_role),
      ('61560786302', 'PEDRO HENRIQUE MORAIS BASTOS',        'Inspetor de Manutenção',           'inspetor'::app_role)
    ) AS t(cpf, nome, cargo, role)
  LOOP
    -- Pula se já existe profile com este CPF
    IF EXISTS (SELECT 1 FROM public.profiles WHERE cpf = r.cpf) THEN
      CONTINUE;
    END IF;

    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      r.cpf || '@oficinamatriz.local',
      v_encrypted,
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object(
        'nome', r.nome,
        'cpf', r.cpf,
        'cargo', r.cargo,
        'must_change_password', true
      ),
      now(), now(), '', '', '', ''
    );

    -- O trigger handle_new_user já criou o profile. Atualiza campos extras.
    UPDATE public.profiles SET
      nome = r.nome,
      cpf = r.cpf,
      cargo = r.cargo,
      turno = 'manha',
      must_change_password = true,
      ativo = true
    WHERE id = v_uid;

    -- Perfil de acesso
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, r.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;

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

-- Reusable updated_at trigger already exists (set_updated_at)

-- ASSETS
CREATE TABLE public.app_assets (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_assets TO authenticated;
GRANT ALL ON public.app_assets TO service_role;
ALTER TABLE public.app_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read assets" ON public.app_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write assets" ON public.app_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER app_assets_updated_at BEFORE UPDATE ON public.app_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INSPECTIONS
CREATE TABLE public.app_inspections (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_inspections TO authenticated;
GRANT ALL ON public.app_inspections TO service_role;
ALTER TABLE public.app_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read insp" ON public.app_inspections FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write insp" ON public.app_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER app_inspections_updated_at BEFORE UPDATE ON public.app_inspections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WORK ORDERS
CREATE TABLE public.app_work_orders (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_work_orders TO authenticated;
GRANT ALL ON public.app_work_orders TO service_role;
ALTER TABLE public.app_work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read wo" ON public.app_work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write wo" ON public.app_work_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER app_work_orders_updated_at BEFORE UPDATE ON public.app_work_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- MECHANICS
CREATE TABLE public.app_mechanics (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_mechanics TO authenticated;
GRANT ALL ON public.app_mechanics TO service_role;
ALTER TABLE public.app_mechanics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read mec" ON public.app_mechanics FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write mec" ON public.app_mechanics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER app_mechanics_updated_at BEFORE UPDATE ON public.app_mechanics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TAGS
CREATE TABLE public.app_tags (
  id text PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_tags TO authenticated;
GRANT ALL ON public.app_tags TO service_role;
ALTER TABLE public.app_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tags" ON public.app_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tags" ON public.app_tags FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SIGNATURES
CREATE TABLE public.app_signatures (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_signatures TO authenticated;
GRANT ALL ON public.app_signatures TO service_role;
ALTER TABLE public.app_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read sig" ON public.app_signatures FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write sig" ON public.app_signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER app_signatures_updated_at BEFORE UPDATE ON public.app_signatures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable Realtime on all
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_inspections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_work_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_mechanics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_signatures;

-- REPLICA IDENTITY FULL so DELETE/UPDATE payloads include old row for realtime
ALTER TABLE public.app_assets REPLICA IDENTITY FULL;
ALTER TABLE public.app_inspections REPLICA IDENTITY FULL;
ALTER TABLE public.app_work_orders REPLICA IDENTITY FULL;
ALTER TABLE public.app_mechanics REPLICA IDENTITY FULL;
ALTER TABLE public.app_tags REPLICA IDENTITY FULL;
ALTER TABLE public.app_signatures REPLICA IDENTITY FULL;
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
update app_assets set data = jsonb_set(data, '{column}', '"aguardando_saida"') where id = 'a-1784938141000';
UPDATE public.app_assets
SET data = (data - 'inspetorLockId' - 'inspetorLockNome' - 'inspetorLockEm'),
    updated_at = now()
WHERE data ? 'inspetorLockId' OR data ? 'inspetorLockNome' OR data ? 'inspetorLockEm';
DELETE FROM public.app_work_orders w
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_assets a
  WHERE a.id = w.data->>'assetId' OR a.data->>'prefixo' = w.data->>'prefixo'
);
DELETE FROM public.app_inspections i
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_assets a
  WHERE a.id = i.data->>'assetId' OR a.data->>'prefixo' = i.data->>'prefixo'
);
ALTER TABLE public.pmp_plans ADD COLUMN IF NOT EXISTS familia text;
DROP INDEX IF EXISTS public.pmp_plans_modelo_intervalo_key;
CREATE UNIQUE INDEX IF NOT EXISTS pmp_plans_modelo_familia_intervalo_key
  ON public.pmp_plans (modelo, COALESCE(familia, ''), intervalo_horas);

-- mapa nome -> id legado (meq-*) e id de perfil (uuid)
create temporary table mec_map as
select lower(trim(m1.data->>'nome')) nome, m1.id as legado, m2.id as novo
from app_mechanics m1
join app_mechanics m2
  on lower(trim(m1.data->>'nome')) = lower(trim(m2.data->>'nome'))
 and m1.id <> m2.id
where m1.id like 'meq-%' and m2.id not like 'meq-%';

-- remapeia mecanicoId nos cards
update app_assets a
set data = jsonb_set(a.data, '{mecanicoId}', to_jsonb(mm.novo))
from mec_map mm
where a.data->>'mecanicoId' = mm.legado;

-- remapeia mecanicoIds (array)
update app_assets a
set data = jsonb_set(
  a.data,
  '{mecanicoIds}',
  (select jsonb_agg(distinct coalesce(mm.novo, e.val))
     from jsonb_array_elements_text(a.data->'mecanicoIds') as e(val)
     left join mec_map mm on mm.legado = e.val)
)
where jsonb_typeof(a.data->'mecanicoIds') = 'array'
  and exists (
    select 1 from jsonb_array_elements_text(a.data->'mecanicoIds') e(val)
    join mec_map mm on mm.legado = e.val
  );

-- remapeia ordens de serviço
update app_work_orders w
set data = jsonb_set(w.data, '{mecanicoId}', to_jsonb(mm.novo))
from mec_map mm
where w.data->>'mecanicoId' = mm.legado;

-- remove cadastros legados duplicados
delete from app_mechanics where id in (select legado from mec_map);
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visitante';
CREATE TABLE public.app_equipment_types (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_equipment_types TO authenticated;
GRANT ALL ON public.app_equipment_types TO service_role;
ALTER TABLE public.app_equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tipos" ON public.app_equipment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tipos" ON public.app_equipment_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
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
UPDATE public.app_assets a
SET data = jsonb_set(a.data, '{pendingTasks}', (
  SELECT jsonb_agg(t || jsonb_build_object('text', upper(t->>'text')))
  FROM jsonb_array_elements(a.data->'pendingTasks') t
))
WHERE jsonb_typeof(a.data->'pendingTasks') = 'array'
  AND jsonb_array_length(a.data->'pendingTasks') > 0;

UPDATE public.app_work_orders w
SET data = jsonb_set(w.data, '{operations}', (
  SELECT jsonb_agg(o
    || jsonb_build_object('problema', upper(coalesce(o->>'problema','')))
    || jsonb_build_object('causa', upper(coalesce(o->>'causa','')))
    || jsonb_build_object('solucao', upper(coalesce(o->>'solucao',''))))
  FROM jsonb_array_elements(w.data->'operations') o
))
WHERE jsonb_typeof(w.data->'operations') = 'array'
  AND jsonb_array_length(w.data->'operations') > 0;

UPDATE public.app_work_orders w
SET data = jsonb_set(w.data, '{pmpChecklist}', (
  SELECT jsonb_agg(c || jsonb_build_object('label', upper(coalesce(c->>'label',''))))
  FROM jsonb_array_elements(w.data->'pmpChecklist') c
))
WHERE jsonb_typeof(w.data->'pmpChecklist') = 'array'
  AND jsonb_array_length(w.data->'pmpChecklist') > 0;

UPDATE public.app_work_orders w
SET data = jsonb_set(w.data, '{falhasHerdadas}', (
  SELECT jsonb_agg(to_jsonb(upper(f#>>'{}')))
  FROM jsonb_array_elements(w.data->'falhasHerdadas') f
))
WHERE jsonb_typeof(w.data->'falhasHerdadas') = 'array'
  AND jsonb_array_length(w.data->'falhasHerdadas') > 0
  AND jsonb_typeof(w.data->'falhasHerdadas'->0) = 'string';
UPDATE public.app_inspections SET data = data || '{"teste": true}'::jsonb WHERE id = 'insp-1784924616084';
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
GRANT INSERT, UPDATE, DELETE ON public.sap_materials TO sandbox_exec;
-- 1) sap_materials: restrict read to authenticated users only
DROP POLICY IF EXISTS "sap_materials_read_all" ON public.sap_materials;
REVOKE SELECT ON public.sap_materials FROM anon;
GRANT SELECT ON public.sap_materials TO authenticated;
GRANT ALL ON public.sap_materials TO service_role;
CREATE POLICY "sap_materials_read_authenticated"
  ON public.sap_materials FOR SELECT TO authenticated USING (true);

-- 2) SECURITY DEFINER trigger function should not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
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
UPDATE public.app_inspections
SET data = jsonb_set(data, '{tipoEntradaSaida}', 'true'::jsonb, true)
WHERE id = 'insp-1786542976245'
  AND upper(regexp_replace(data->>'prefixo', '[^A-Z0-9]', '', 'g')) = 'CDT093'
  AND data->>'tipo' = 'saida'
  AND data->'inspetorSig' IS NOT NULL
  AND data->'supervisorSig' IS NULL;
UPDATE public.app_inspections SET data = (data - 'supervisorSig') - 'supervisorSigEm', updated_at = now() WHERE id = 'insp-1786542976245';
UPDATE public.app_inspections
SET data = jsonb_set(data - 'tipoEntradaSaida', '{tipo}', '"entrada"'::jsonb),
    updated_at = now()
WHERE id = 'insp-1786542976245';
UPDATE public.app_assets
SET data = data - 'libNovoStatus' - 'libNovoInspetorSig' - 'libNovoInspetorEm' - 'libNovoSupervisorSig' - 'libNovoSupervisorEm',
    updated_at = now()
WHERE id = 'a-1785953777779';
UPDATE public.app_assets SET data = data - 'dataLiberacao' WHERE id = 'card-te-112-oficina-engelog-arm-25744fb6';
