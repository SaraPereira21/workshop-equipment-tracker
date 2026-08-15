UPDATE public.app_inspections
SET data = jsonb_set(data, '{tipoEntradaSaida}', 'true'::jsonb, true)
WHERE id = 'insp-1786542976245'
  AND upper(regexp_replace(data->>'prefixo', '[^A-Z0-9]', '', 'g')) = 'CDT093'
  AND data->>'tipo' = 'saida'
  AND data->'inspetorSig' IS NOT NULL
  AND data->'supervisorSig' IS NULL;