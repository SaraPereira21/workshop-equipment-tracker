
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
