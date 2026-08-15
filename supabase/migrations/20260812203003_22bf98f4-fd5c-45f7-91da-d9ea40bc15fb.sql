UPDATE public.app_inspections
SET data = jsonb_set(data - 'tipoEntradaSaida', '{tipo}', '"entrada"'::jsonb),
    updated_at = now()
WHERE id = 'insp-1786542976245';