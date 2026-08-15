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