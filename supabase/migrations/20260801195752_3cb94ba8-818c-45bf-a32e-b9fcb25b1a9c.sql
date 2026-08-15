CREATE TABLE public.app_equipment_types (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_equipment_types TO authenticated;
GRANT ALL ON public.app_equipment_types TO service_role;
ALTER TABLE public.app_equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tipos" ON public.app_equipment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write tipos" ON public.app_equipment_types FOR ALL TO authenticated USING (true) WITH CHECK (true);