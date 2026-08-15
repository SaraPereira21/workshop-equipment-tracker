
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
